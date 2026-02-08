import { describe, it, expect, vi } from 'vitest'
import { buildDependencyContext } from '../../src/tools/dependencyContext.js'
import type { ToolKit } from '../../src/tools/toolkit.js'
import { ok, err } from '../../src/utils/result.js'

function createMockToolKit(packageJsonContent?: string): ToolKit {
  return {
    readFile: vi.fn().mockImplementation((path: string) => {
      if (path === 'package.json' && packageJsonContent !== undefined) {
        return ok(packageJsonContent)
      }
      return err({ type: 'not_found', message: 'File not found', path })
    }),
    writeFile: vi.fn().mockReturnValue(ok(undefined)),
    listDirectory: vi.fn().mockReturnValue(ok([])),
    fileExists: vi.fn().mockReturnValue(false),
    runCommand: vi.fn().mockReturnValue(ok({ stdout: '', stderr: '', exitCode: 0 })),
    getProjectRoot: vi.fn().mockReturnValue('/project'),
  }
}

describe('buildDependencyContext', () => {
  it('generates context with production and dev dependencies', () => {
    const toolkit = createMockToolKit(JSON.stringify({
      dependencies: { zod: '^3.0.0', express: '^4.0.0' },
      devDependencies: { vitest: '^1.0.0', typescript: '^5.0.0' },
    }))

    const context = buildDependencyContext(toolkit)

    expect(context).toContain('DEPENDENCY CONSTRAINTS')
    expect(context).toContain('zod')
    expect(context).toContain('express')
    expect(context).toContain('vitest')
    expect(context).toContain('typescript')
    expect(context).toContain('ONLY import from the listed packages')
    expect(context).toContain('node:')
  })

  it('handles project with no dependencies', () => {
    const toolkit = createMockToolKit(JSON.stringify({
      name: 'empty-project',
    }))

    const context = buildDependencyContext(toolkit)

    expect(context).toContain('DEPENDENCY CONSTRAINTS')
    expect(context).toContain('No production dependencies installed')
  })

  it('returns fallback when package.json is missing', () => {
    const toolkit = createMockToolKit()

    const context = buildDependencyContext(toolkit)

    expect(context).toContain('DEPENDENCY CONSTRAINTS')
    expect(context).toContain('Could not read package.json')
    expect(context).toContain('built-in modules')
  })

  it('returns fallback when package.json is corrupt', () => {
    const toolkit = createMockToolKit('not valid json {{{')

    const context = buildDependencyContext(toolkit)

    expect(context).toContain('DEPENDENCY CONSTRAINTS')
    expect(context).toContain('Could not parse package.json')
  })

  it('includes Node.js built-in modules list', () => {
    const toolkit = createMockToolKit(JSON.stringify({
      dependencies: { zod: '^3.0.0' },
    }))

    const context = buildDependencyContext(toolkit)

    expect(context).toContain('fs')
    expect(context).toContain('path')
    expect(context).toContain('crypto')
    expect(context).toContain('http')
    expect(context).toContain('https')
  })

  it('includes substitution advice', () => {
    const toolkit = createMockToolKit(JSON.stringify({
      dependencies: { zod: '^3.0.0' },
    }))

    const context = buildDependencyContext(toolkit)

    expect(context).toContain('node:https')
    expect(context).toContain('randomUUID')
    expect(context).toContain('node:fs')
  })
})
