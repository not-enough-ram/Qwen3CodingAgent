import type { Agent, AgentContext } from './types.js'
import type { PlannerInput, PlannerOutput } from '../schemas/planner.js'
import type { AgentError } from '../schemas/common.js'
import { PlannerOutputSchema } from '../schemas/planner.js'
import { buildPlannerPrompt } from '../prompts/planner.js'
import { type Result, err } from '../utils/result.js'

export const plannerAgent: Agent<PlannerInput, PlannerOutput> = async (
  input: PlannerInput,
  context: AgentContext
): Promise<Result<PlannerOutput, AgentError>> => {
  context.logger.info({ request: input.request.slice(0, 100) }, 'Starting planner agent')

  const messages = buildPlannerPrompt(input.request, input.projectContext)

  const result = await context.llm.generateStructured(messages, PlannerOutputSchema)

  if (!result.ok) {
    context.logger.error({ error: result.error }, 'Planner agent failed')
    return err({
      type: 'llm_error',
      message: result.error.message,
      details: result.error,
      retryable: result.error.type !== 'connection',
    })
  }

  context.logger.info(
    { taskCount: result.value.tasks.length },
    'Planner agent completed'
  )

  return result
}
