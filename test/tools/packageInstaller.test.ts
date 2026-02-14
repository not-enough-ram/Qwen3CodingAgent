import { describe, it, expect } from 'vitest'
import { buildInstallArgs, installPackages } from '../../src/tools/packageInstaller.js'

describe('buildInstallArgs', () => {
  it('builds npm install args with --save', () => {
    const args = buildInstallArgs('npm', ['zod'])
    expect(args).toEqual(['install', '--save', 'zod'])
  })

  it('builds npm install args with multiple packages', () => {
    const args = buildInstallArgs('npm', ['zod', 'axios', 'lodash'])
    expect(args).toEqual(['install', '--save', 'zod', 'axios', 'lodash'])
  })

  it('builds pnpm add args', () => {
    const args = buildInstallArgs('pnpm', ['zod'])
    expect(args).toEqual(['add', 'zod'])
  })

  it('builds yarn add args', () => {
    const args = buildInstallArgs('yarn', ['zod'])
    expect(args).toEqual(['add', 'zod'])
  })

  it('handles scoped packages', () => {
    const args = buildInstallArgs('pnpm', ['@types/node'])
    expect(args).toEqual(['add', '@types/node'])
  })

  it('builds npm --save-dev args for dev category', () => {
    const args = buildInstallArgs('npm', ['vitest'], 'dev')
    expect(args).toEqual(['install', '--save-dev', 'vitest'])
  })

  it('builds pnpm -D args for dev category', () => {
    const args = buildInstallArgs('pnpm', ['vitest'], 'dev')
    expect(args).toEqual(['add', '-D', 'vitest'])
  })

  it('builds yarn --dev args for dev category', () => {
    const args = buildInstallArgs('yarn', ['vitest'], 'dev')
    expect(args).toEqual(['add', '--dev', 'vitest'])
  })

  it('defaults to prod when no category specified', () => {
    const args = buildInstallArgs('npm', ['zod'])
    expect(args).toEqual(['install', '--save', 'zod'])
  })

  it('handles multiple dev packages', () => {
    const args = buildInstallArgs('pnpm', ['@types/node', 'vitest'], 'dev')
    expect(args).toEqual(['add', '-D', '@types/node', 'vitest'])
  })

  it('explicit prod category matches default behavior', () => {
    const args = buildInstallArgs('npm', ['zod'], 'prod')
    expect(args).toEqual(['install', '--save', 'zod'])
  })
})

describe('installPackages', () => {
  it('rejects package names with shell metacharacters', async () => {
    const result = await installPackages({
      packageManager: 'pnpm',
      packages: ['zod; rm -rf /'],
      projectRoot: '/tmp',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('invalid_argument')
      expect(result.error.message).toContain('shell characters')
    }
  })

  it('rejects package names with backticks', async () => {
    const result = await installPackages({
      packageManager: 'npm',
      packages: ['`malicious`'],
      projectRoot: '/tmp',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('invalid_argument')
    }
  })

  it('rejects package names with pipe', async () => {
    const result = await installPackages({
      packageManager: 'yarn',
      packages: ['pkg | cat /etc/passwd'],
      projectRoot: '/tmp',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('invalid_argument')
    }
  })
})
