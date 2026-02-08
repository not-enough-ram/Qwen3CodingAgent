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
import { ImportValidator } from '../tools/importValidator.js'
import type { ConsentManager } from '../consent/index.js'
import type { Config } from '../utils/config.js'
import { createLogger, type Logger } from '../utils/logger.js'
import { type Result, ok, err } from '../utils/result.js'

export type TaskResult = {
  task: Task
  changes: FileChange[]
  reviewPassed: boolean
  reviewIssues: ReviewIssue[]
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

  // Create import validator
  const importValidator = config.pipeline.enableImportValidation
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
      errors.push(`Architect failed for task ${task.id}: ${archResult.error.message}`)
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
      errors.push(`Coder failed for task ${task.id}: ${codeResult.error.message}`)
      continue
    }

    // Step 2b-2: Import validation loop (before review)
    if (importValidator) {
      const jsExtensions = /\.(ts|js|tsx|jsx|mjs|cjs)$/

      for (let importAttempt = 0; importAttempt < config.pipeline.maxImportRetries; importAttempt++) {
        const allMissing: string[] = []
        const allSuggestions: string[] = []

        for (const change of codeResult.value.changes) {
          if (!jsExtensions.test(change.path)) continue

          if (options.consentManager) {
            // Use consent-aware validation
            const result = await importValidator.validateWithConsent(
              change.content,
              options.consentManager
            )
            if (!result.valid) {
              allMissing.push(...result.rejectedPackages)
              // Build suggestions for rejected packages only
              for (const pkg of result.rejectedPackages) {
                const baseResult = importValidator.validate(change.content)
                const fix = baseResult.suggestedFixes.find((s) => s.startsWith(`${pkg}:`))
                if (fix) allSuggestions.push(fix)
              }
            }
          } else {
            const result = importValidator.validate(change.content)
            if (!result.valid) {
              allMissing.push(...result.missingPackages)
              allSuggestions.push(...result.suggestedFixes)
            }
          }
        }

        if (allMissing.length === 0) break

        const uniqueMissing = [...new Set(allMissing)]
        const uniqueSuggestions = [...new Set(allSuggestions)]

        pipelineLogger.info(
          { taskId: task.id, attempt: importAttempt + 1, missingPackages: uniqueMissing },
          'Import validation failed, retrying coder'
        )

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
