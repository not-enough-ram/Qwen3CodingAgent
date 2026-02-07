import { loadConfig } from '../../utils/config.js'
import { createLogger } from '../../utils/logger.js'
import { createLLMClient } from '../../llm/client.js'
import { createToolKit } from '../../tools/toolkit.js'
import { plannerAgent } from '../../agents/planner.js'
import { architectAgent } from '../../agents/architect.js'
import { gatherProjectContext, formatProjectContext } from '../../tools/context.js'
import { randomUUID } from 'node:crypto'

type PlanOptions = {
  project: string
  verbose: boolean
}

export async function planCommand(request: string, options: PlanOptions): Promise<void> {
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
  const llm = createLLMClient(config.llm)
  const tools = createToolKit(options.project)
  const conversationId = randomUUID()

  log.info({}, `Planning: "${request}"`)

  // Gather project context
  const projectContext = gatherProjectContext(tools, config.context)
  const formattedContext = formatProjectContext(projectContext)

  console.log('\n--- Project Context ---')
  console.log(`Name: ${projectContext.name}`)
  console.log(`Language: ${projectContext.language}`)
  if (projectContext.framework) {
    console.log(`Framework: ${projectContext.framework}`)
  }
  console.log(`Dependencies: ${projectContext.dependencies.length}`)
  console.log('')

  // Run planner
  const planResult = await plannerAgent(
    { request, projectContext: formattedContext },
    { llm, tools, logger: logger.child('planner'), conversationId }
  )

  if (!planResult.ok) {
    console.error(`\nPlanning failed: ${planResult.error.message}`)
    process.exit(1)
  }

  console.log('\n--- Task Breakdown ---')
  for (const task of planResult.value.tasks) {
    console.log(`\n[${task.id}] ${task.title}`)
    console.log(`    ${task.description}`)
    if (task.dependsOn.length > 0) {
      console.log(`    Depends on: ${task.dependsOn.join(', ')}`)
    }
    if (task.estimatedFiles.length > 0) {
      console.log(`    Files: ${task.estimatedFiles.join(', ')}`)
    }
  }

  // Run architect for each task
  console.log('\n--- Architecture Plans ---')
  for (const task of planResult.value.tasks) {
    const archResult = await architectAgent(
      {
        task: { id: task.id, title: task.title, description: task.description },
        projectContext: formattedContext,
        existingFiles: task.estimatedFiles,
      },
      { llm, tools, logger: logger.child('architect'), conversationId }
    )

    if (!archResult.ok) {
      console.error(`\nArchitect failed for ${task.id}: ${archResult.error.message}`)
      continue
    }

    console.log(`\n[${task.id}] ${task.title}`)
    console.log(`Reasoning: ${archResult.value.reasoning}`)
    console.log('Files:')
    for (const file of archResult.value.files) {
      console.log(`  ${file.operation === 'create' ? '+' : '~'} ${file.path}`)
      console.log(`    ${file.description}`)
    }
  }

  console.log('\n--- Dry Run Complete ---')
  console.log('Use "agent-helper run" to execute this plan.')
}
