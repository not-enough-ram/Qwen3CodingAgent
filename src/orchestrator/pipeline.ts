import { randomUUID } from 'node:crypto'
import type { AgentContext } from '../agents/types.js'
import { plannerAgent } from '../agents/planner.js'
import { architectAgent } from '../agents/architect.js'
import { coderAgent } from '../agents/coder.js'
import { reviewerAgent } from '../agents/reviewer.js'
import type { Task } from '../schemas/planner.js'
import type { FileChange } from '../schemas/coder.js'
import type { ReviewIssue } from '../schemas/reviewer.js'
import type { LLMClient } from '../llm/client.js'
import type { ToolKit } from '../tools/toolkit.js'
import { gatherProjectContext, formatProjectContext } from '../tools/context.js'
import { buildDependencyContext } from '../tools/dependencyContext.js'
import { ImportValidator, type AlternativeInfo } from '../tools/importValidator.js'
import { detectPackageManager, type PackageManager } from '../tools/packageManager.js'
import { validatePackagesBatch } from '../tools/packageRegistry.js'
import { installPackages } from '../tools/packageInstaller.js'
import { categorizePackages } from '../tools/dependencyCategorizer.js'
import type { ConsentManager } from '../consent/index.js'
import type { Config } from '../utils/config.js'
import { createLogger, type Logger } from '../utils/logger.js'
import { type Result, ok, err } from '../utils/result.js'

export type TaskResult = {
  task: Task
  changes: FileChange[]
  reviewPassed: boolean
  reviewIssues: ReviewIssue[]
  skipped?: { reason: string }
}

export type PipelineResult = {
  success: boolean
  results: TaskResult[]
  errors: string[]
}

export type PipelineOptions = {
  llm: LLMClient
  tools: ToolKit
  config: Config
  logger?: Logger
  consentManager?: ConsentManager
  autoInstall?: boolean
}

export async function runPipeline(
  request: string,
  options: PipelineOptions
): Promise<Result<PipelineResult, string>> {
  const { llm, tools, config } = options
  const logger = options.logger ?? createLogger({ level: 'info' })
  const conversationId = randomUUID()

  const pipelineLogger = logger.child('pipeline')
  pipelineLogger.info({ conversationId }, 'Starting pipeline')

  // Gather project context
  const projectContext = gatherProjectContext(tools, config.context)
  const formattedContext = formatProjectContext(projectContext)

  // Build dependency context for coder prompt injection
  const dependencyContext = buildDependencyContext(tools)

  // Detect package manager (once per pipeline run)
  let detectedPM: PackageManager | null = null
  const pmResult = detectPackageManager(tools.getProjectRoot())
  if (pmResult.ok) {
    detectedPM = pmResult.value
    pipelineLogger.info({ packageManager: detectedPM }, 'Detected package manager')
  } else {
    pipelineLogger.warn(
      { found: pmResult.error.found },
      'Multiple lock files detected, skipping auto-installation'
    )
  }

  // Track installed packages across tasks (separated by category)
  const installedProd: string[] = []
  const installedDev: string[] = []

  // Create import validator
  let importValidator = config.pipeline.enableImportValidation
    ? new ImportValidator(projectContext.dependencies, projectContext.devDependencies)
    : null

  // Create agent context factory
  const createAgentContext = (scope: string): AgentContext => ({
    llm,
    tools,
    logger: logger.child(scope),
    conversationId,
  })

  // Step 1: Run planner
  const planResult = await plannerAgent(
    { request, projectContext: formattedContext },
    createAgentContext('planner')
  )

  if (!planResult.ok) {
    return err(`Planning failed: ${planResult.error.message}`)
  }

  const tasks = planResult.value.tasks
  pipelineLogger.info({ taskCount: tasks.length }, 'Planning complete')

  const results: TaskResult[] = []
  const errors: string[] = []

  // Step 2: Process each task
  for (const task of tasks) {
    pipelineLogger.info({ taskId: task.id, title: task.title }, 'Processing task')

    // Step 2a: Run architect
    const archResult = await architectAgent(
      {
        task: { id: task.id, title: task.title, description: task.description },
        projectContext: formattedContext,
        existingFiles: task.estimatedFiles,
      },
      createAgentContext('architect')
    )

    if (!archResult.ok) {
      const reason = `Architect failed: ${archResult.error.message}`
      errors.push(`Architect failed for task ${task.id}: ${archResult.error.message}`)
      results.push({
        task,
        changes: [],
        reviewPassed: false,
        reviewIssues: [],
        skipped: { reason },
      })
      continue
    }

    const plan = archResult.value

    // Gather relevant file contents
    const relevantFiles: Array<{ path: string; content: string }> = []
    for (const file of plan.files) {
      if (file.operation === 'modify') {
        const readResult = tools.readFile(file.path)
        if (readResult.ok) {
          relevantFiles.push({ path: file.path, content: readResult.value })
        }
      }
    }

    // Step 2b: Run coder with retry loop
    const coderInput = {
      task: { id: task.id, title: task.title, description: task.description },
      plan: {
        files: plan.files.map((f) => ({
          path: f.path,
          operation: f.operation,
          description: f.description,
        })),
        reasoning: plan.reasoning,
      },
      relevantFiles,
      dependencyContext,
    }

    let codeResult = await coderAgent(coderInput, createAgentContext('coder'))

    if (!codeResult.ok) {
      const reason = `Coder failed: ${codeResult.error.message}`
      errors.push(`Coder failed for task ${task.id}: ${codeResult.error.message}`)
      results.push({
        task,
        changes: [],
        reviewPassed: false,
        reviewIssues: [],
        skipped: { reason },
      })
      continue
    }

    // Step 2b-2: Import validation + dependency installation loop (before review)
    if (importValidator) {
      const jsExtensions = /\.(ts|js|tsx|jsx|mjs|cjs)$/

      for (let importAttempt = 0; importAttempt < config.pipeline.maxImportRetries; importAttempt++) {
        const allMissing: string[] = []
        const allSuggestions: string[] = []
        // Track which files import each package for categorization
        const packageFileMap = new Map<string, string[]>()
        // Collect structured alternatives for consent UX
        const allAlternatives = new Map<string, AlternativeInfo>()

        for (const change of codeResult.value.changes) {
          if (!jsExtensions.test(change.path)) continue
          const result = importValidator.validate(change.content)
          if (!result.valid) {
            allMissing.push(...result.missingPackages)
            allSuggestions.push(...result.suggestedFixes)
            for (const pkg of result.missingPackages) {
              const files = packageFileMap.get(pkg) ?? []
              files.push(change.path)
              packageFileMap.set(pkg, files)
            }
            for (const [pkg, altInfo] of result.alternatives) {
              allAlternatives.set(pkg, altInfo)
            }
          }
        }

        if (allMissing.length === 0) break

        const uniqueMissing = [...new Set(allMissing)]
        const uniqueSuggestions = [...new Set(allSuggestions)]

        pipelineLogger.info(
          { taskId: task.id, attempt: importAttempt + 1, missingPackages: uniqueMissing },
          'Import validation found missing packages'
        )

        // Try installing missing packages if PM is detected
        if (detectedPM) {
          // Registry validation: check which packages actually exist on npm
          const registryResults = await validatePackagesBatch(uniqueMissing)
          const registryValid: string[] = []
          const registryInvalid: string[] = []

          for (const [pkg, result] of registryResults) {
            if (result.exists) {
              registryValid.push(pkg)
            } else {
              registryInvalid.push(pkg)
              pipelineLogger.warn({ package: pkg, error: result.error }, 'Package not found on registry')
            }
          }

          // Consent for valid packages
          let approved: string[] = []
          let rejected: string[] = []
          // Track packages where user chose a built-in alternative
          let selectedAlternatives = new Map<string, string>()

          if (registryValid.length > 0) {

            if (options.autoInstall) {
              // --auto-install flag: skip consent
              approved = registryValid
              pipelineLogger.info({ packages: approved }, 'Auto-installing packages')
            } else if (options.consentManager) {
              const batchResult = await options.consentManager.checkBatchApprovalWithAlternatives(
                registryValid,
                {
                  alternatives: allAlternatives,
                  fileContext: packageFileMap,
                }
              )
              approved = batchResult.approved
              rejected = [...batchResult.rejected]
              selectedAlternatives = batchResult.alternatives
            } else {
              // No consent manager and no auto-install — can't install
              approved = []
              rejected = registryValid
            }

            // Categorize and install approved packages
            if (approved.length > 0) {
              const entries = approved.map((pkg) => ({
                name: pkg,
                files: packageFileMap.get(pkg) ?? [],
              }))
              const categorized = categorizePackages(entries)

              pipelineLogger.info(
                { prod: categorized.production, dev: categorized.dev, pm: detectedPM },
                'Installing categorized packages'
              )

              const allInstalled: string[] = []
              let installFailed = false

              // Install production packages first
              if (categorized.production.length > 0) {
                const prodResult = await installPackages({
                  packageManager: detectedPM,
                  packages: categorized.production,
                  projectRoot: tools.getProjectRoot(),
                  category: 'prod',
                })
                if (prodResult.ok) {
                  allInstalled.push(...categorized.production)
                  installedProd.push(...categorized.production)
                } else {
                  pipelineLogger.warn({ error: prodResult.error.message }, 'Production install failed')
                  registryInvalid.push(...categorized.production)
                  installFailed = true
                }
              }

              // Install dev packages
              if (categorized.dev.length > 0) {
                const devResult = await installPackages({
                  packageManager: detectedPM,
                  packages: categorized.dev,
                  projectRoot: tools.getProjectRoot(),
                  category: 'dev',
                })
                if (devResult.ok) {
                  allInstalled.push(...categorized.dev)
                  installedDev.push(...categorized.dev)
                } else {
                  pipelineLogger.warn({ error: devResult.error.message }, 'Dev install failed')
                  registryInvalid.push(...categorized.dev)
                  installFailed = true
                }
              }

              if (allInstalled.length > 0) {
                pipelineLogger.info({ packages: allInstalled }, 'Packages installed successfully')

                // Rebuild ImportValidator with separate prod/dev tracking
                importValidator = new ImportValidator(
                  [...projectContext.dependencies, ...installedProd],
                  [...projectContext.devDependencies, ...installedDev]
                )

                // Re-validate imports after installation
                let allResolved = true
                for (const change of codeResult.value.changes) {
                  if (!jsExtensions.test(change.path)) continue
                  const recheck = importValidator.validate(change.content)
                  if (!recheck.valid) {
                    allResolved = false
                    break
                  }
                }

                if (allResolved) {
                  pipelineLogger.info({}, 'All imports resolved after installation')
                  break // No need to re-run coder
                }
              }

              if (installFailed && allInstalled.length === 0) {
                approved = []
              }
            }
          }

          // Handle alternative selections: trigger coder retry with built-in replacement instructions
          if (selectedAlternatives.size > 0) {
            const altFeedbackLines: string[] = []
            for (const [pkg, altModule] of selectedAlternatives) {
              const altInfo = allAlternatives.get(pkg)
              altFeedbackLines.push(
                `User chose built-in alternative for "${pkg}". Replace all imports of "${pkg}" with "${altModule}".`
              )
              if (altInfo?.example) {
                altFeedbackLines.push(`  Example: ${altInfo.example}`)
              }
            }

            pipelineLogger.info(
              { taskId: task.id, alternatives: [...selectedAlternatives.keys()] },
              'Rewriting code with built-in alternatives'
            )

            codeResult = await coderAgent(
              { ...coderInput, importValidationFeedback: altFeedbackLines.join('\n') },
              createAgentContext('coder')
            )

            if (!codeResult.ok) {
              errors.push(`Coder alternative-rewrite failed for task ${task.id}: ${codeResult.error.message}`)
              break
            }
          }

          // Build feedback for packages that couldn't be installed
          const unresolvable = [...registryInvalid, ...rejected]
          if (unresolvable.length > 0) {
            const feedbackLines: string[] = []
            for (const pkg of registryInvalid) {
              const suggestion = uniqueSuggestions.find((s) => s.startsWith(`${pkg}:`))
              feedbackLines.push(
                `Package "${pkg}" does not exist on npm registry. ${suggestion ?? 'Remove this import or implement manually.'}`
              )
            }
            for (const pkg of rejected) {
              feedbackLines.push(
                `Package "${pkg}" was rejected by user. Rewrite without using this package.`
              )
            }

            codeResult = await coderAgent(
              { ...coderInput, importValidationFeedback: feedbackLines.join('\n') },
              createAgentContext('coder')
            )

            if (!codeResult.ok) {
              errors.push(`Coder import-fix retry failed for task ${task.id}: ${codeResult.error.message}`)
              break
            }
          }
        } else {
          // No PM detected — fall back to original behavior (tell coder to rewrite)
          const feedbackLines = [
            `The following packages are NOT installed and MUST NOT be imported: ${uniqueMissing.join(', ')}`,
            '',
            'Suggested alternatives:',
            ...uniqueSuggestions.map((s) => `- ${s}`),
          ]

          codeResult = await coderAgent(
            { ...coderInput, importValidationFeedback: feedbackLines.join('\n') },
            createAgentContext('coder')
          )

          if (!codeResult.ok) {
            errors.push(`Coder import-fix retry failed for task ${task.id}: ${codeResult.error.message}`)
            break
          }
        }
      }

      if (!codeResult.ok) continue
    }

    let reviewPassed = false
    let reviewIssues: ReviewIssue[] = []

    // Step 2c: Review loop
    for (let attempt = 0; attempt <= config.pipeline.maxReviewRetries; attempt++) {
      const reviewResult = await reviewerAgent(
        {
          originalRequest: request,
          task: { id: task.id, title: task.title, description: task.description },
          changes: codeResult.value.changes.map((c) => ({
            path: c.path,
            content: c.content,
          })),
          projectDependencies: [
            ...projectContext.dependencies,
            ...projectContext.devDependencies,
          ],
        },
        createAgentContext('reviewer')
      )

      if (!reviewResult.ok) {
        errors.push(`Reviewer failed for task ${task.id}: ${reviewResult.error.message}`)
        break
      }

      reviewIssues = reviewResult.value.issues

      if (reviewResult.value.passed) {
        reviewPassed = true
        break
      }

      // If not passed and we have retries left, run coder again with feedback
      if (attempt < config.pipeline.maxReviewRetries) {
        pipelineLogger.info(
          { taskId: task.id, attempt: attempt + 1 },
          'Retrying coder with review feedback'
        )

        codeResult = await coderAgent(
          {
            ...coderInput,
            reviewFeedback: {
              issues: reviewResult.value.issues,
              summary: reviewResult.value.summary,
            },
          },
          createAgentContext('coder')
        )

        if (!codeResult.ok) {
          errors.push(`Coder retry failed for task ${task.id}: ${codeResult.error.message}`)
          break
        }
      }
    }

    if (codeResult.ok) {
      results.push({
        task,
        changes: codeResult.value.changes,
        reviewPassed,
        reviewIssues,
      })
    }
  }

  const success = results.length > 0 && results.every((r) => r.reviewPassed)

  pipelineLogger.info(
    { success, taskCount: results.length, errorCount: errors.length },
    'Pipeline complete'
  )

  return ok({ success, results, errors })
}
