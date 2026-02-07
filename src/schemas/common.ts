import { z } from 'zod'

/**
 * Common error types used across agents
 */
export const AgentErrorSchema = z.object({
  type: z.enum(['llm_error', 'schema_validation', 'tool_error', 'timeout', 'unknown']),
  message: z.string(),
  details: z.unknown().optional(),
  retryable: z.boolean().default(true),
})

export type AgentError = z.infer<typeof AgentErrorSchema>

/**
 * Tool error for file system and shell operations
 */
export const ToolErrorSchema = z.object({
  type: z.enum(['not_found', 'permission_denied', 'invalid_path', 'execution_failed', 'timeout']),
  message: z.string(),
  path: z.string().optional(),
})

export type ToolError = z.infer<typeof ToolErrorSchema>

/**
 * LLM-specific errors
 */
export const LLMErrorSchema = z.object({
  type: z.enum(['connection', 'timeout', 'rate_limit', 'invalid_response', 'schema_validation']),
  message: z.string(),
  details: z.unknown().optional(),
  attempt: z.number().optional(),
})

export type LLMError = z.infer<typeof LLMErrorSchema>
