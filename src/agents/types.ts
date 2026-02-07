import type { LLMClient } from '../llm/client.js'
import type { ToolKit } from '../tools/toolkit.js'
import type { Logger, ScopedLogger } from '../utils/logger.js'
import type { Result } from '../utils/result.js'
import type { AgentError } from '../schemas/common.js'

/**
 * Context provided to all agents
 */
export type AgentContext = {
  llm: LLMClient
  tools?: ToolKit
  logger: ScopedLogger
  conversationId: string
}

/**
 * Generic agent type
 */
export type Agent<I, O> = (input: I, context: AgentContext) => Promise<Result<O, AgentError>>
