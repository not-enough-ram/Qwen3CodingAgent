import { describe, it, expect } from 'vitest'
import {
  isTestFile,
  categorizePackage,
  categorizePackages,
  type CategorizedPackages,
  type PackageEntry,
} from '../../src/tools/dependencyCategorizer.js'

describe('dependencyCategorizer', () => {
  describe('isTestFile', () => {
    it('detects vitest/jest .test.* patterns', () => {
      expect(isTestFile('src/foo.test.ts')).toBe(true)
      expect(isTestFile('src/foo.spec.ts')).toBe(true)
      expect(isTestFile('src/foo.test.js')).toBe(true)
      expect(isTestFile('src/foo.spec.jsx')).toBe(true)
      expect(isTestFile('src/foo.test.mts')).toBe(true)
    })

    it('detects __tests__ directory pattern', () => {
      expect(isTestFile('__tests__/foo.ts')).toBe(true)
      expect(isTestFile('src/__tests__/helper.js')).toBe(true)
    })

    it('detects test/tests/spec directory patterns', () => {
      expect(isTestFile('test/foo.ts')).toBe(true)
      expect(isTestFile('tests/foo.ts')).toBe(true)
      expect(isTestFile('spec/foo.ts')).toBe(true)
      expect(isTestFile('src/test/utils.js')).toBe(true)
      expect(isTestFile('src/tests/helper.ts')).toBe(true)
    })

    it('detects dash-separated test patterns', () => {
      expect(isTestFile('src/foo-test.ts')).toBe(true)
      expect(isTestFile('src/foo-spec.ts')).toBe(true)
    })

    it('returns false for production files', () => {
      expect(isTestFile('src/foo.ts')).toBe(false)
      expect(isTestFile('src/utils/helper.js')).toBe(false)
    })

    it('returns false for files containing "test" but not matching pattern', () => {
      expect(isTestFile('src/testUtils.ts')).toBe(false)
      expect(isTestFile('src/contest.ts')).toBe(false)
      expect(isTestFile('src/latest.ts')).toBe(false)
    })
  })

  describe('categorizePackage', () => {
    it('categorizes known dev packages as dev even in prod files', () => {
      expect(categorizePackage('vitest', ['src/main.ts'])).toBe('dev')
      expect(categorizePackage('jest', ['src/app.ts'])).toBe('dev')
      expect(categorizePackage('eslint', ['src/lint.ts'])).toBe('dev')
      expect(categorizePackage('prettier', ['src/format.ts'])).toBe('dev')
      expect(categorizePackage('typescript', ['scripts/build.ts'])).toBe('dev')
    })

    it('categorizes known dev packages as dev in test files', () => {
      expect(categorizePackage('vitest', ['test/setup.ts'])).toBe('dev')
      expect(categorizePackage('mocha', ['test/app.test.ts'])).toBe('dev')
    })

    it('categorizes @types/* as dev regardless of importing file', () => {
      expect(categorizePackage('@types/node', ['src/server.ts'])).toBe('dev')
      expect(categorizePackage('@types/express', ['test/app.test.ts'])).toBe('dev')
      expect(categorizePackage('@types/react', ['src/App.tsx'])).toBe('dev')
    })

    it('categorizes packages used only in test files as dev', () => {
      expect(categorizePackage('zod', ['test/user.test.ts'])).toBe('dev')
      expect(categorizePackage('some-lib', ['test/utils.spec.ts', 'test/helper.test.ts'])).toBe('dev')
    })

    it('categorizes packages used in any prod file as prod', () => {
      expect(categorizePackage('zod', ['src/user.ts', 'test/user.test.ts'])).toBe('prod')
      expect(categorizePackage('express', ['src/server.ts'])).toBe('prod')
      expect(categorizePackage('unknown-pkg', ['src/app.ts'])).toBe('prod')
    })

    it('defaults to prod for unknown packages without context', () => {
      expect(categorizePackage('unknown-lib', [])).toBe('prod')
      expect(categorizePackage('some-random-package', ['src/index.ts'])).toBe('prod')
    })
  })

  describe('categorizePackages', () => {
    it('batches packages into production and dev categories', () => {
      const entries: PackageEntry[] = [
        { name: 'zod', files: ['src/user.ts'] },
        { name: 'vitest', files: ['test/setup.ts'] },
        { name: 'express', files: ['src/server.ts'] },
        { name: '@types/node', files: ['src/index.ts'] },
      ]

      const result = categorizePackages(entries)

      expect(result.production).toEqual(['zod', 'express'])
      expect(result.dev).toEqual(['vitest', '@types/node'])
    })

    it('handles mixed usage correctly', () => {
      const entries: PackageEntry[] = [
        { name: 'zod', files: ['src/user.ts', 'test/user.test.ts'] },
        { name: 'chai', files: ['test/assertions.ts'] },
      ]

      const result = categorizePackages(entries)

      expect(result.production).toEqual(['zod'])
      expect(result.dev).toEqual(['chai'])
    })

    it('handles empty input', () => {
      const result = categorizePackages([])

      expect(result.production).toEqual([])
      expect(result.dev).toEqual([])
    })
  })
})
