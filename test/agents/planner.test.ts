import { describe, it, expect, vi, beforeEach } from 'vitest'
import { plannerAgent } from '../../src/agents/planner.js'
import type { AgentContext } from '../../src/agents/types.js'
import type { LLMClient } from '../../src/llm/client.js'
import { ok, err } from '../../src/utils/result.js'

function createMockContext(llm: LLMClient): AgentContext {
  return {
    llm,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    conversationId: 'test-conversation',
  }
}

describe('plannerAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns tasks on success', async () => {
    const mockLLM: LLMClient = {
      generate: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue(
        ok({
          tasks: [
            {
              id: 'task-1',
              title: 'Create model',
              description: 'Create the data model',
              dependsOn: [],
              estimatedFiles: ['src/model.ts'],
            },
          ],
        })
      ),
    }

    const result = await plannerAgent(
      {
        request: 'Create a user model',
        projectContext: 'TypeScript project',
      },
      createMockContext(mockLLM)
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tasks.length).toBe(1)
      expect(result.value.tasks[0]?.id).toBe('task-1')
    }
  })

  it('returns error on LLM failure', async () => {
    const mockLLM: LLMClient = {
      generate: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue(
        err({
          type: 'connection',
          message: 'Connection failed',
        })
      ),
    }

    const result = await plannerAgent(
      {
        request: 'Create a user model',
        projectContext: 'TypeScript project',
      },
      createMockContext(mockLLM)
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('llm_error')
    }
  })

  it('handles multiple tasks with dependencies', async () => {
    const mockLLM: LLMClient = {
      generate: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue(
        ok({
          tasks: [
            {
              id: 'task-1',
              title: 'Create interface',
              description: 'Define User interface',
              dependsOn: [],
              estimatedFiles: ['src/types.ts'],
            },
            {
              id: 'task-2',
              title: 'Create service',
              description: 'Implement UserService',
              dependsOn: ['task-1'],
              estimatedFiles: ['src/service.ts'],
            },
          ],
        })
      ),
    }

    const result = await plannerAgent(
      {
        request: 'Create user service',
        projectContext: 'TypeScript project',
      },
      createMockContext(mockLLM)
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tasks.length).toBe(2)
      expect(result.value.tasks[1]?.dependsOn).toContain('task-1')
    }
  })
})
