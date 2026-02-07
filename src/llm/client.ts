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
  // Remove markdown code fences if present
  let cleaned = text.trim()

  // Handle ```json ... ``` or ``` ... ```
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m)
  if (fenceMatch?.[1]) {
    cleaned = fenceMatch[1].trim()
  }

  // Handle cases where there's text before/after the JSON
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (jsonMatch?.[0]) {
    cleaned = jsonMatch[0]
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
        lastError = result.error.message
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
