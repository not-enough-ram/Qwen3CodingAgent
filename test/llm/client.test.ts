import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn(() => 'mock-model')),
}))

import { generateText } from 'ai'
import { createLLMClient } from '../../src/llm/client.js'

const mockGenerateText = vi.mocked(generateText)

describe('createLLMClient', () => {
  const defaultConfig = {
    baseUrl: 'http://localhost:11434/v1',
    model: 'test-model',
    apiKey: '',
    maxTokens: 4096,
    temperature: 0.2,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generate', () => {
    it('returns text on success', async () => {
      mockGenerateText.mockResolvedValue({ text: 'Hello world' } as never)

      const client = createLLMClient(defaultConfig)
      const result = await client.generate([
        { role: 'user', content: 'Say hello' },
      ])

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('Hello world')
      }
    })

    it('returns connection error on ECONNREFUSED', async () => {
      mockGenerateText.mockRejectedValue(new Error('ECONNREFUSED'))

      const client = createLLMClient(defaultConfig)
      const result = await client.generate([
        { role: 'user', content: 'Test' },
      ])

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('connection')
      }
    })
  })

  describe('generateStructured', () => {
    const TestSchema = z.object({
      message: z.string(),
      count: z.number(),
    })

    it('parses valid JSON response', async () => {
      mockGenerateText.mockResolvedValue({
        text: '{"message": "hello", "count": 42}',
      } as never)

      const client = createLLMClient(defaultConfig)
      const result = await client.generateStructured(
        [{ role: 'user', content: 'Test' }],
        TestSchema
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.message).toBe('hello')
        expect(result.value.count).toBe(42)
      }
    })

    it('handles markdown-wrapped JSON', async () => {
      mockGenerateText.mockResolvedValue({
        text: '```json\n{"message": "hello", "count": 42}\n```',
      } as never)

      const client = createLLMClient(defaultConfig)
      const result = await client.generateStructured(
        [{ role: 'user', content: 'Test' }],
        TestSchema
      )

      expect(result.ok).toBe(true)
    })

    it('handles Qwen3 thinking tags', async () => {
      mockGenerateText.mockResolvedValue({
        text: '<think>Let me think about this JSON structure...</think>\n{"message": "hello", "count": 42}',
      } as never)

      const client = createLLMClient(defaultConfig)
      const result = await client.generateStructured(
        [{ role: 'user', content: 'Test' }],
        TestSchema
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.message).toBe('hello')
        expect(result.value.count).toBe(42)
      }
    })

    it('handles thinking tags with braces inside', async () => {
      mockGenerateText.mockResolvedValue({
        text: '<think>I need to create an object with {braces}</think>\n{"message": "test", "count": 1}',
      } as never)

      const client = createLLMClient(defaultConfig)
      const result = await client.generateStructured(
        [{ role: 'user', content: 'Test' }],
        TestSchema
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.message).toBe('test')
        expect(result.value.count).toBe(1)
      }
    })

    it('retries on invalid JSON', async () => {
      mockGenerateText
        .mockResolvedValueOnce({ text: 'not json' } as never)
        .mockResolvedValueOnce({
          text: '{"message": "hello", "count": 42}',
        } as never)

      const client = createLLMClient(defaultConfig)
      const result = await client.generateStructured(
        [{ role: 'user', content: 'Test' }],
        TestSchema
      )

      expect(result.ok).toBe(true)
      expect(mockGenerateText).toHaveBeenCalledTimes(2)
    })

    it('returns error after max retries', async () => {
      mockGenerateText.mockResolvedValue({ text: 'invalid' } as never)

      const client = createLLMClient(defaultConfig)
      const result = await client.generateStructured(
        [{ role: 'user', content: 'Test' }],
        TestSchema,
        { retries: 2 }
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('schema_validation')
      }
      expect(mockGenerateText).toHaveBeenCalledTimes(2)
    })
  })
})
