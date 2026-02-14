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
