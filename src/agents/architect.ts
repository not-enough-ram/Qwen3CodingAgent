import type { Agent, AgentContext } from './types.js'
import type { ArchitectInput, ArchitectOutput } from '../schemas/architect.js'
import type { AgentError } from '../schemas/common.js'
import { ArchitectOutputSchema } from '../schemas/architect.js'
import { buildArchitectPrompt } from '../prompts/architect.js'
import { type Result, err } from '../utils/result.js'

export const architectAgent: Agent<ArchitectInput, ArchitectOutput> = async (
  input: ArchitectInput,
  context: AgentContext
): Promise<Result<ArchitectOutput, AgentError>> => {
  context.logger.info({ taskId: input.task.id }, 'Starting architect agent')

  const messages = buildArchitectPrompt({
    taskTitle: input.task.title,
    taskDescription: input.task.description,
    projectContext: input.projectContext,
    existingFiles: input.existingFiles,
  })

  const result = await context.llm.generateStructured(messages, ArchitectOutputSchema)

  if (!result.ok) {
    context.logger.error({ error: result.error }, 'Architect agent failed')
    return err({
      type: 'llm_error',
      message: result.error.message,
      details: result.error,
      retryable: result.error.type !== 'connection',
    })
  }

  context.logger.info(
    { fileCount: result.value.files.length },
    'Architect agent completed'
  )

  return result
}
