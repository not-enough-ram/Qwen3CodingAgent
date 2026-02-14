import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectPackageManager } from '../../src/tools/packageManager.js'

describe('detectPackageManager', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pm-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('single lock file detection', () => {
    it('returns pnpm when only pnpm-lock.yaml exists', () => {
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0')

      const result = detectPackageManager(tempDir)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('pnpm')
      }
    })

    it('returns npm when only package-lock.json exists', () => {
      writeFileSync(join(tempDir, 'package-lock.json'), '{"lockfileVersion": 3}')

      const result = detectPackageManager(tempDir)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('npm')
      }
    })

    it('returns yarn when only yarn.lock exists', () => {
      writeFileSync(join(tempDir, 'yarn.lock'), '# yarn lockfile v1')

      const result = detectPackageManager(tempDir)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('yarn')
      }
    })
  })

  describe('multiple lock files (error case)', () => {
    it('returns error when both pnpm-lock.yaml and package-lock.json exist', () => {
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0')
      writeFileSync(join(tempDir, 'package-lock.json'), '{"lockfileVersion": 3}')

      const result = detectPackageManager(tempDir)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('multiple_lock_files')
        expect(result.error.found).toContain('pnpm')
        expect(result.error.found).toContain('npm')
        expect(result.error.found).toHaveLength(2)
        expect(result.error.message.toLowerCase()).toContain('multiple')
      }
    })

    it('returns error when all three lock files exist', () => {
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0')
      writeFileSync(join(tempDir, 'package-lock.json'), '{"lockfileVersion": 3}')
      writeFileSync(join(tempDir, 'yarn.lock'), '# yarn lockfile v1')

      const result = detectPackageManager(tempDir)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('multiple_lock_files')
        expect(result.error.found).toContain('pnpm')
        expect(result.error.found).toContain('npm')
        expect(result.error.found).toContain('yarn')
        expect(result.error.found).toHaveLength(3)
      }
    })
  })

  describe('package.json packageManager field fallback', () => {
    it('returns pnpm when no lock file but package.json has packageManager pnpm@8.6.0', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({ packageManager: 'pnpm@8.6.0' })
      )

      const result = detectPackageManager(tempDir)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('pnpm')
      }
    })

    it('returns npm when no lock file but package.json has packageManager npm@10.0.0+sha224.abc123', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({ packageManager: 'npm@10.0.0+sha224.abc123' })
      )

      const result = detectPackageManager(tempDir)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('npm')
      }
    })

    it('returns yarn when no lock file but package.json has packageManager yarn@4.0.0', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({ packageManager: 'yarn@4.0.0' })
      )

      const result = detectPackageManager(tempDir)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('yarn')
      }
    })
  })

  describe('default behavior', () => {
    it('returns npm when no lock file and no packageManager field', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({ name: 'test-project' })
      )

      const result = detectPackageManager(tempDir)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('npm')
      }
    })

    it('returns npm when no lock file and no package.json exists', () => {
      const result = detectPackageManager(tempDir)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('npm')
      }
    })
  })

  describe('priority order', () => {
    it('lock file detection takes priority over packageManager field', () => {
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0')
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({ packageManager: 'npm@10.0.0' })
      )

      const result = detectPackageManager(tempDir)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('pnpm')
      }
    })
  })
})
