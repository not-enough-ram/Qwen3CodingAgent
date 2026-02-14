import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runPipeline } from '../../src/orchestrator/pipeline.js'
import { ok, err } from '../../src/utils/result.js'
import { createLogger } from '../../src/utils/logger.js'
import { getDefaultConfig } from '../../src/utils/config.js'
import type { LLMClient } from '../../src/llm/client.js'
import type { ToolKit } from '../../src/tools/toolkit.js'

// Mock external I/O modules for categorized installation tests
// Use vi.hoisted to create mock functions that survive hoisting
const mocks = vi.hoisted(() => ({
  detectPackageManager: vi.fn(),
  validatePackagesBatch: vi.fn(),
  installPackages: vi.fn(),
}))

vi.mock('../../src/tools/packageManager.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/tools/packageManager.js')>()
  return { ...original, detectPackageManager: mocks.detectPackageManager }
})

vi.mock('../../src/tools/packageRegistry.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/tools/packageRegistry.js')>()
  return { ...original, validatePackagesBatch: mocks.validatePackagesBatch }
})

vi.mock('../../src/tools/packageInstaller.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/tools/packageInstaller.js')>()
  return { ...original, installPackages: mocks.installPackages }
})

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
    // Default: no package manager detected (skip install path for existing tests)
    mocks.detectPackageManager.mockReturnValue(err({ found: [] }))
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

  describe('categorized dependency installation', () => {
    // Helper: create a mock LLM that generates code with specific imports
    function createInstallTestLLM(coderChanges: Array<{ path: string; content: string }>): LLMClient {
      return {
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
              files: coderChanges.map((c) => ({
                path: c.path,
                operation: 'create',
                description: 'Create file',
              })),
              reasoning: 'New files',
            })
          )
          // Coder
          .mockResolvedValueOnce(ok({ changes: coderChanges }))
          // Reviewer
          .mockResolvedValueOnce(ok({ passed: true, issues: [], summary: 'OK' })),
      }
    }

    function createToolKitWithDeps(deps: Record<string, string> = {}, devDeps: Record<string, string> = {}): ToolKit {
      const tools = createMockToolKit()
      ;(tools.readFile as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
        if (path === 'package.json') {
          return ok(JSON.stringify({
            name: 'test-project',
            dependencies: deps,
            devDependencies: devDeps,
          }))
        }
        return ok('file content')
      })
      return tools
    }

    beforeEach(() => {
      // Set up mocks for categorized install path
      mocks.detectPackageManager.mockReturnValue(ok('npm' as const))
      mocks.validatePackagesBatch.mockImplementation(async (packages: string[]) => {
        const map = new Map<string, { exists: boolean }>()
        for (const pkg of packages) {
          map.set(pkg, { exists: true })
        }
        return map
      })
      mocks.installPackages.mockResolvedValue(
        ok({ success: true, packages: [], packageManager: 'npm' as const })
      )
    })

    it('installs test-file-only packages as devDependencies', async () => {
      const mockLLM = createInstallTestLLM([
        { path: 'test/utils.test.ts', content: "import { expect } from 'chai'\nconst x = 1" },
      ])
      const tools = createToolKitWithDeps()

      const result = await runPipeline('Create tests', {
        llm: mockLLM,
        tools,
        config,
        logger,
        autoInstall: true,
      })

      expect(result.ok).toBe(true)
      // installPackages should have been called with category: 'dev' for chai
      const installCalls = mocks.installPackages.mock.calls
      const devCall = installCalls.find((call) => call[0].category === 'dev')
      expect(devCall).toBeDefined()
      expect(devCall![0].packages).toContain('chai')
      // No prod install call with chai
      const prodCall = installCalls.find((call) => call[0].category === 'prod' && call[0].packages.length > 0)
      expect(prodCall).toBeUndefined()
    })

    it('installs production-file packages as production dependencies', async () => {
      const mockLLM = createInstallTestLLM([
        { path: 'src/handler.ts', content: "import express from 'express'\nconst app = express()" },
      ])
      const tools = createToolKitWithDeps()

      const result = await runPipeline('Create handler', {
        llm: mockLLM,
        tools,
        config,
        logger,
        autoInstall: true,
      })

      expect(result.ok).toBe(true)
      const installCalls = mocks.installPackages.mock.calls
      const prodCall = installCalls.find((call) => call[0].category === 'prod')
      expect(prodCall).toBeDefined()
      expect(prodCall![0].packages).toContain('express')
    })

    it('separates mixed batch into prod and dev installations', async () => {
      const mockLLM = createInstallTestLLM([
        { path: 'src/app.ts', content: "import Fastify from 'fastify'\nconst app = Fastify()" },
        { path: 'test/app.test.ts', content: "import sinon from 'sinon'\nconst stub = sinon.stub()" },
      ])
      const tools = createToolKitWithDeps()

      const result = await runPipeline('Create app with tests', {
        llm: mockLLM,
        tools,
        config,
        logger,
        autoInstall: true,
      })

      expect(result.ok).toBe(true)
      const installCalls = mocks.installPackages.mock.calls
      const prodCall = installCalls.find((call) => call[0].category === 'prod')
      const devCall = installCalls.find((call) => call[0].category === 'dev')
      expect(prodCall).toBeDefined()
      expect(prodCall![0].packages).toContain('fastify')
      expect(devCall).toBeDefined()
      expect(devCall![0].packages).toContain('sinon')
    })

    it('categorizes @types/* packages as dev even from production files', async () => {
      const mockLLM = createInstallTestLLM([
        { path: 'src/types.ts', content: "import type { Request } from '@types/express'\nconst x = 1" },
      ])
      const tools = createToolKitWithDeps()

      const result = await runPipeline('Add types', {
        llm: mockLLM,
        tools,
        config,
        logger,
        autoInstall: true,
      })

      expect(result.ok).toBe(true)
      const installCalls = mocks.installPackages.mock.calls
      const devCall = installCalls.find((call) => call[0].category === 'dev')
      expect(devCall).toBeDefined()
      expect(devCall![0].packages).toContain('@types/express')
    })

    it('categorizes package as prod when used in both test and prod files', async () => {
      const mockLLM = createInstallTestLLM([
        { path: 'src/validate.ts', content: "import { z } from 'zod'\nconst schema = z.string()" },
        { path: 'test/validate.test.ts', content: "import { z } from 'zod'\nconst s = z.number()" },
      ])
      const tools = createToolKitWithDeps()

      const result = await runPipeline('Add validation', {
        llm: mockLLM,
        tools,
        config,
        logger,
        autoInstall: true,
      })

      expect(result.ok).toBe(true)
      const installCalls = mocks.installPackages.mock.calls
      const prodCall = installCalls.find((call) => call[0].category === 'prod')
      expect(prodCall).toBeDefined()
      expect(prodCall![0].packages).toContain('zod')
      // zod should NOT be in any dev install
      const devCallWithZod = installCalls.find(
        (call) => call[0].category === 'dev' && call[0].packages.includes('zod')
      )
      expect(devCallWithZod).toBeUndefined()
    })
  })
})
