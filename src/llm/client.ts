import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import type { z } from 'zod'
import { type Result, ok, err } from '../utils/result.js'
import type { LLMError } from '../schemas/common.js'
import type { Config } from '../utils/config.js'

export type LLMClient = {
  generate: (messages: Message[]) => Promise<Result<string, LLMError>>
  generateStructured: <Output, Def extends z.ZodTypeDef = z.ZodTypeDef, Input = Output>(
    messages: Message[],
    schema: z.ZodType<Output, Def, Input>,
    options?: { retries?: number } | undefined
  ) => Promise<Result<Output, LLMError>>
}

export type Message = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Try to parse JSON from LLM response, handling common issues
 */
function tryParseJSON(text: string): unknown {
  let cleaned = text.trim()

  // Remove <think>...</think> blocks (Qwen3 thinking mode)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  // Handle ```json ... ``` or ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch?.[1]) {
    cleaned = fenceMatch[1].trim()
  }

  // Find the outermost JSON object by matching balanced braces
  const startIdx = cleaned.indexOf('{')
  if (startIdx !== -1) {
    let depth = 0
    let endIdx = -1
    let inString = false
    let escape = false

    for (let i = startIdx; i < cleaned.length; i++) {
      const char = cleaned[i]

      if (escape) {
        escape = false
        continue
      }

      if (char === '\\' && inString) {
        escape = true
        continue
      }

      if (char === '"') {
        inString = !inString
        continue
      }

      if (!inString) {
        if (char === '{') depth++
        else if (char === '}') {
          depth--
          if (depth === 0) {
            endIdx = i
            break
          }
        }
      }
    }

    if (endIdx !== -1) {
      cleaned = cleaned.slice(startIdx, endIdx + 1)
    }
  }

  return JSON.parse(cleaned)
}

function formatZodError(error: z.ZodError): string {
  return error.errors
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join('\n')
}

export function createLLMClient(config: Config['llm']): LLMClient {
  const provider = createOpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey || 'not-needed',
  })

  const model = provider(config.model)

  const generate = async (messages: Message[]): Promise<Result<string, LLMError>> => {
    try {
      const response = await generateText({
        model,
        messages,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      })

      return ok(response.text)
    } catch (e) {
      const error = e as Error
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        return err({
          type: 'connection',
          message: `Failed to connect to LLM server at ${config.baseUrl}`,
          details: error.message,
        })
      }
      if (error.message.includes('timeout')) {
        return err({
          type: 'timeout',
          message: 'LLM request timed out',
          details: error.message,
        })
      }
      return err({
        type: 'invalid_response',
        message: 'Unexpected LLM error',
        details: error.message,
      })
    }
  }

  const generateStructured = async <Output, Def extends z.ZodTypeDef = z.ZodTypeDef, Input = Output>(
    messages: Message[],
    schema: z.ZodType<Output, Def, Input>,
    options: { retries?: number } = {}
  ): Promise<Result<Output, LLMError>> => {
    const maxRetries = options.retries ?? 3
    let lastError: string | undefined

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const currentMessages = [...messages]

      // Add retry context if this is a retry
      if (attempt > 0 && lastError) {
        currentMessages.push({
          role: 'user',
          content: `Your previous response was invalid. Error: ${lastError}\n\nPlease respond with valid JSON only. No markdown fences, no explanations.`,
        })
      }

      const result = await generate(currentMessages)

      if (!result.ok) {
        // Don't retry on connection errors
        if (result.error.type === 'connection') {
          return result
        }
        // Preserve the actual error details, not just the generic message
        const details = result.error.details
        lastError = typeof details === 'string' ? details : result.error.message
        continue
      }

      try {
        const parsed = tryParseJSON(result.value)
        const validated = schema.safeParse(parsed)

        if (validated.success) {
          return ok(validated.data)
        }

        lastError = formatZodError(validated.error)
      } catch (e) {
        lastError = `JSON parse error: ${(e as Error).message}`
      }
    }

    return err({
      type: 'schema_validation',
      message: `Failed to get valid structured output after ${maxRetries} attempts`,
      details: lastError,
      attempt: maxRetries,
    })
  }

  return { generate, generateStructured }
}
