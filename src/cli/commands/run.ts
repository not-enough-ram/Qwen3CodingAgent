import { createInterface } from 'node:readline'
import { loadConfig } from '../../utils/config.js'
import { createLogger } from '../../utils/logger.js'
import { createLLMClient } from '../../llm/client.js'
import { createToolKit } from '../../tools/toolkit.js'
import { runPipeline } from '../../orchestrator/pipeline.js'
import { ConsentManager } from '../../consent/index.js'
import {
  stageChanges,
  applyChanges,
  formatChangesSummary,
  generateDiff,
} from '../../orchestrator/staging.js'

type RunOptions = {
  project: string
  yes: boolean
  verbose: boolean
  nonInteractive?: boolean
  autoInstall?: boolean
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.toLowerCase().trim())
    })
  })
}

export async function runCommand(request: string, options: RunOptions): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'debug' : 'info',
  })

  const log = logger.child('cli')
  log.info({}, 'Loading configuration')

  const configResult = loadConfig(options.project)
  if (!configResult.ok) {
    console.error(`Configuration error: ${configResult.error.message}`)
    process.exit(1)
  }

  const config = configResult.value

  if (options.yes) {
    config.pipeline.applyChangesAutomatically = true
  }

  const llm = createLLMClient(config.llm)
  const tools = createToolKit(options.project)

  const nonInteractive = options.nonInteractive ?? process.env['CI'] === 'true'
  const consentManager = new ConsentManager(options.project, { nonInteractive })

  const cleanup = () => {
    consentManager.cleanup()
  }
  process.on('SIGINT', () => { cleanup(); process.exit(0) })
  process.on('SIGTERM', () => { cleanup(); process.exit(0) })

  log.info({}, `Running: "${request}"`)

  const result = await runPipeline(request, {
    llm,
    tools,
    config,
    logger,
    consentManager,
    autoInstall: options.autoInstall ?? false,
  })

  if (!result.ok) {
    console.error(`\nPipeline failed: ${result.error}`)
    process.exit(1)
  }

  const { success, results, errors } = result.value

  // Print errors if any
  if (errors.length > 0) {
    console.error('\nErrors:')
    for (const error of errors) {
      console.error(`  - ${error}`)
    }
  }

  // Print results for each task
  for (const taskResult of results) {
    const statusIcon = taskResult.reviewPassed ? '\u2705' : '\u26a0\ufe0f'
    console.log(`\n${statusIcon} Task: ${taskResult.task.title}`)

    const issueStats = {
      errors: taskResult.reviewIssues.filter((i) => i.severity === 'error').length,
      warnings: taskResult.reviewIssues.filter((i) => i.severity === 'warning').length,
      suggestions: taskResult.reviewIssues.filter((i) => i.severity === 'suggestion').length,
    }

    if (taskResult.reviewIssues.length > 0) {
      const parts: string[] = []
      if (issueStats.errors > 0) parts.push(`${issueStats.errors} errors`)
      if (issueStats.warnings > 0) parts.push(`${issueStats.warnings} warnings`)
      if (issueStats.suggestions > 0) parts.push(`${issueStats.suggestions} suggestions`)
      console.log(`   Review: ${parts.join(', ')}`)
    }

    // Stage changes
    const staged = stageChanges(taskResult.changes, tools)
    console.log(`\n${formatChangesSummary(staged)}`)

    if (!taskResult.reviewPassed && !config.pipeline.applyChangesAutomatically) {
      console.log('\nReview did not pass. Issues:')
      for (const issue of taskResult.reviewIssues) {
        console.log(`  [${issue.severity}] ${issue.file}: ${issue.description}`)
        if (issue.suggestedFix) {
          console.log(`    Fix: ${issue.suggestedFix}`)
        }
      }
    }

    // Apply changes prompt
    if (config.pipeline.applyChangesAutomatically) {
      const applyResult = applyChanges(staged, tools)
      if (!applyResult.ok) {
        console.error(`\nFailed to apply changes: ${applyResult.error}`)
      } else {
        console.log('\nChanges applied.')
      }
    } else {
      const answer = await prompt('\nApply changes? [y/N/diff] ')

      if (answer === 'diff' || answer === 'd') {
        for (const change of staged) {
          console.log('\n' + generateDiff(change))
        }
        const confirmAnswer = await prompt('\nApply changes? [y/N] ')
        if (confirmAnswer === 'y' || confirmAnswer === 'yes') {
          const applyResult = applyChanges(staged, tools)
          if (!applyResult.ok) {
            console.error(`\nFailed to apply changes: ${applyResult.error}`)
          } else {
            console.log('\nChanges applied.')
          }
        } else {
          console.log('\nChanges discarded.')
        }
      } else if (answer === 'y' || answer === 'yes') {
        const applyResult = applyChanges(staged, tools)
        if (!applyResult.ok) {
          console.error(`\nFailed to apply changes: ${applyResult.error}`)
        } else {
          console.log('\nChanges applied.')
        }
      } else {
        console.log('\nChanges discarded.')
      }
    }
  }

  cleanup()

  if (!success) {
    process.exit(1)
  }
}
