import type { Agent, AgentContext } from './types.js'
import type { ReviewerInput, ReviewerOutput } from '../schemas/reviewer.js'
import type { AgentError } from '../schemas/common.js'
import { ReviewerOutputSchema } from '../schemas/reviewer.js'
import { buildReviewerPrompt } from '../prompts/reviewer.js'
import { type Result, err } from '../utils/result.js'

export const reviewerAgent: Agent<ReviewerInput, ReviewerOutput> = async (
  input: ReviewerInput,
  context: AgentContext
): Promise<Result<ReviewerOutput, AgentError>> => {
  context.logger.info({ taskId: input.task.id }, 'Starting reviewer agent')

  const messages = buildReviewerPrompt({
    originalRequest: input.originalRequest,
    taskTitle: input.task.title,
    taskDescription: input.task.description,
    changes: input.changes,
    projectDependencies: input.projectDependencies,
  })

  const result = await context.llm.generateStructured(messages, ReviewerOutputSchema)

  if (!result.ok) {
    context.logger.error({ error: result.error }, 'Reviewer agent failed')
    return err({
      type: 'llm_error',
      message: result.error.message,
      details: result.error,
      retryable: result.error.type !== 'connection',
    })
  }

  context.logger.info(
    {
      passed: result.value.passed,
      issueCount: result.value.issues.length,
    },
    'Reviewer agent completed'
  )

  return result
}
