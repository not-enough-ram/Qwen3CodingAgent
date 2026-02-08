import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runPipeline } from '../../src/orchestrator/pipeline.js'
import { ok, err } from '../../src/utils/result.js'
import { createLogger } from '../../src/utils/logger.js'
import { getDefaultConfig } from '../../src/utils/config.js'
import type { LLMClient } from '../../src/llm/client.js'
import type { ToolKit } from '../../src/tools/toolkit.js'

function createMockToolKit(): ToolKit {
  return {
    readFile: vi.fn().mockReturnValue(ok('file content')),
    writeFile: vi.fn().mockReturnValue(ok(undefined)),
    listDirectory: vi.fn().mockReturnValue(ok(['file1.ts', 'file2.ts'])),
    fileExists: vi.fn().mockReturnValue(true),
    runCommand: vi.fn().mockReturnValue(ok({ stdout: '', stderr: '', exitCode: 0 })),
    getProjectRoot: vi.fn().mockReturnValue('/project'),
  }
}

describe('runPipeline', () => {
  const config = getDefaultConfig()
  const logger = createLogger({ level: 'error' }) // Suppress logs in tests

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs full pipeline successfully', async () => {
    const mockLLM: LLMClient = {
      generate: vi.fn(),
      generateStructured: vi.fn()
        // Planner response
        .mockResolvedValueOnce(
          ok({
            tasks: [
              {
                id: 'task-1',
                title: 'Create model',
                description: 'Create data model',
                dependsOn: [],
                estimatedFiles: ['src/model.ts'],
              },
            ],
          })
        )
        // Architect response
        .mockResolvedValueOnce(
          ok({
            files: [
              {
                path: 'src/model.ts',
                operation: 'create',
                description: 'Create model file',
              },
            ],
            reasoning: 'New file needed',
          })
        )
        // Coder response
        .mockResolvedValueOnce(
          ok({
            changes: [
              {
                path: 'src/model.ts',
                content: 'export type Model = {}',
              },
            ],
          })
        )
        // Reviewer response
        .mockResolvedValueOnce(
          ok({
            passed: true,
            issues: [],
            summary: 'Looks good',
          })
        ),
    }

    const tools = createMockToolKit()

    const result = await runPipeline('Create a model', {
      llm: mockLLM,
      tools,
      config,
      logger,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.success).toBe(true)
      expect(result.value.results.length).toBe(1)
      expect(result.value.results[0]?.reviewPassed).toBe(true)
    }
  })

  it('handles review retry', async () => {
    const mockLLM: LLMClient = {
      generate: vi.fn(),
      generateStructured: vi.fn()
        // Planner
        .mockResolvedValueOnce(
          ok({
            tasks: [
              { id: 'task-1', title: 'Task', description: 'Desc', dependsOn: [], estimatedFiles: [] },
            ],
          })
        )
        // Architect
        .mockResolvedValueOnce(
          ok({
            files: [{ path: 'src/file.ts', operation: 'create', description: 'Create' }],
            reasoning: 'New',
          })
        )
        // Coder first attempt
        .mockResolvedValueOnce(
          ok({
            changes: [{ path: 'src/file.ts', content: 'bad code' }],
          })
        )
        // Reviewer fails
        .mockResolvedValueOnce(
          ok({
            passed: false,
            issues: [{ severity: 'error', file: 'src/file.ts', description: 'Bug' }],
            summary: 'Has bug',
          })
        )
        // Coder retry
        .mockResolvedValueOnce(
          ok({
            changes: [{ path: 'src/file.ts', content: 'good code' }],
          })
        )
        // Reviewer passes
        .mockResolvedValueOnce(
          ok({
            passed: true,
            issues: [],
            summary: 'Fixed',
          })
        ),
    }

    const tools = createMockToolKit()

    const result = await runPipeline('Fix bug', {
      llm: mockLLM,
      tools,
      config,
      logger,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.success).toBe(true)
    }
    // Verify coder was called twice
    expect(mockLLM.generateStructured).toHaveBeenCalledTimes(6)
  })

  it('catches forbidden imports and retries coder', async () => {
    const tools = createMockToolKit()
    // Return valid package.json so import validator has real dependency info
    ;(tools.readFile as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path === 'package.json') {
        return ok(JSON.stringify({
          name: 'test-project',
          dependencies: { zod: '^3.0.0' },
          devDependencies: { vitest: '^1.0.0' },
        }))
      }
      return ok('file content')
    })

    const mockLLM: LLMClient = {
      generate: vi.fn(),
      generateStructured: vi.fn()
        // Planner
        .mockResolvedValueOnce(
          ok({
            tasks: [
              { id: 'task-1', title: 'Task', description: 'Desc', dependsOn: [], estimatedFiles: [] },
            ],
          })
        )
        // Architect
        .mockResolvedValueOnce(
          ok({
            files: [{ path: 'src/file.ts', operation: 'create', description: 'Create' }],
            reasoning: 'New',
          })
        )
        // Coder first attempt - uses forbidden import
        .mockResolvedValueOnce(
          ok({
            changes: [{ path: 'src/file.ts', content: "import axios from 'axios'\nconst x = 1" }],
          })
        )
        // Coder retry after import validation - uses valid import
        .mockResolvedValueOnce(
          ok({
            changes: [{ path: 'src/file.ts', content: "import { request } from 'node:https'\nconst x = 1" }],
          })
        )
        // Reviewer passes
        .mockResolvedValueOnce(
          ok({
            passed: true,
            issues: [],
            summary: 'Looks good',
          })
        ),
    }

    const result = await runPipeline('Create feature', {
      llm: mockLLM,
      tools,
      config,
      logger,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.success).toBe(true)
    }
    // Coder called twice (initial + import retry), plus planner + architect + reviewer = 5
    expect(mockLLM.generateStructured).toHaveBeenCalledTimes(5)
  })

  it('passes validation when imports are all valid', async () => {
    const tools = createMockToolKit()
    ;(tools.readFile as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path === 'package.json') {
        return ok(JSON.stringify({
          name: 'test-project',
          dependencies: { zod: '^3.0.0' },
        }))
      }
      return ok('file content')
    })

    const mockLLM: LLMClient = {
      generate: vi.fn(),
      generateStructured: vi.fn()
        // Planner
        .mockResolvedValueOnce(
          ok({
            tasks: [
              { id: 'task-1', title: 'Task', description: 'Desc', dependsOn: [], estimatedFiles: [] },
            ],
          })
        )
        // Architect
        .mockResolvedValueOnce(
          ok({
            files: [{ path: 'src/file.ts', operation: 'create', description: 'Create' }],
            reasoning: 'New',
          })
        )
        // Coder - valid imports only
        .mockResolvedValueOnce(
          ok({
            changes: [{ path: 'src/file.ts', content: "import { z } from 'zod'\nimport { readFileSync } from 'node:fs'" }],
          })
        )
        // Reviewer passes
        .mockResolvedValueOnce(
          ok({
            passed: true,
            issues: [],
            summary: 'Looks good',
          })
        ),
    }

    const result = await runPipeline('Create feature', {
      llm: mockLLM,
      tools,
      config,
      logger,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.success).toBe(true)
    }
    // No import retry needed: planner + architect + coder + reviewer = 4
    expect(mockLLM.generateStructured).toHaveBeenCalledTimes(4)
  })

  it('returns error when planner fails', async () => {
    const mockLLM: LLMClient = {
      generate: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue(
        err({
          type: 'connection',
          message: 'Failed to connect',
        })
      ),
    }

    const tools = createMockToolKit()

    const result = await runPipeline('Test', {
      llm: mockLLM,
      tools,
      config,
      logger,
    })

    expect(result.ok).toBe(false)
  })
})
