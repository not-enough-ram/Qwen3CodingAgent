import type { Agent, AgentContext } from './types.js'
import type { CoderInput, CoderOutput } from '../schemas/coder.js'
import type { AgentError } from '../schemas/common.js'
import { CoderOutputSchema } from '../schemas/coder.js'
import { buildCoderPrompt } from '../prompts/coder.js'
import { type Result, err } from '../utils/result.js'

export const coderAgent: Agent<CoderInput, CoderOutput> = async (
  input: CoderInput,
  context: AgentContext
): Promise<Result<CoderOutput, AgentError>> => {
  context.logger.info(
    { taskId: input.task.id, hasReviewFeedback: !!input.reviewFeedback },
    'Starting coder agent'
  )

  const messages = buildCoderPrompt({
    taskTitle: input.task.title,
    taskDescription: input.task.description,
    plan: input.plan,
    relevantFiles: input.relevantFiles,
    reviewFeedback: input.reviewFeedback,
    dependencyContext: input.dependencyContext,
    importValidationFeedback: input.importValidationFeedback,
  })

  const result = await context.llm.generateStructured(messages, CoderOutputSchema)

  if (!result.ok) {
    context.logger.error({ error: result.error }, 'Coder agent failed')
    return err({
      type: 'llm_error',
      message: result.error.message,
      details: result.error,
      retryable: result.error.type !== 'connection',
    })
  }

  context.logger.info(
    { changeCount: result.value.changes.length },
    'Coder agent completed'
  )

  return result
}
