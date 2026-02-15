import { describe, it, expect, vi } from 'vitest'
import { ImportValidator, ImportValidationError, SUBSTITUTION_MAP } from '../../src/tools/importValidator.js'

describe('ImportValidator', () => {
  const validator = new ImportValidator(['zod', 'express', '@types/node'], ['vitest', 'typescript'])

  describe('extractImports and validate', () => {
    it('allows installed packages', () => {
      const code = `
        import { z } from 'zod'
        import express from 'express'
      `
      const result = validator.validate(code)
      expect(result.valid).toBe(true)
      expect(result.missingPackages).toEqual([])
    })

    it('allows relative imports', () => {
      const code = `
        import { foo } from './utils.js'
        import bar from '../lib/bar.js'
      `
      const result = validator.validate(code)
      expect(result.valid).toBe(true)
    })

    it('allows Node.js built-in modules with node: prefix', () => {
      const code = `
        import { readFileSync } from 'node:fs'
        import path from 'node:path'
        import { randomUUID } from 'node:crypto'
      `
      const result = validator.validate(code)
      expect(result.valid).toBe(true)
    })

    it('allows Node.js built-in modules without node: prefix', () => {
      const code = `
        import { readFileSync } from 'fs'
        import path from 'path'
        import crypto from 'crypto'
      `
      const result = validator.validate(code)
      expect(result.valid).toBe(true)
    })

    it('detects forbidden ES6 imports', () => {
      const code = `
        import axios from 'axios'
        import { v4 as uuidv4 } from 'uuid'
      `
      const result = validator.validate(code)
      expect(result.valid).toBe(false)
      expect(result.missingPackages).toContain('axios')
      expect(result.missingPackages).toContain('uuid')
    })

    it('detects forbidden CommonJS require', () => {
      const code = `
        const lodash = require('lodash')
        const chalk = require('chalk')
      `
      const result = validator.validate(code)
      expect(result.valid).toBe(false)
      expect(result.missingPackages).toContain('lodash')
      expect(result.missingPackages).toContain('chalk')
    })

    it('detects forbidden dynamic imports', () => {
      const code = `
        const mod = await import('axios')
      `
      const result = validator.validate(code)
      expect(result.valid).toBe(false)
      expect(result.missingPackages).toContain('axios')
    })

    it('handles scoped packages', () => {
      const code = `
        import { something } from '@types/node'
        import { other } from '@scope/unknown-pkg'
      `
      const result = validator.validate(code)
      expect(result.missingPackages).toContain('@scope/unknown-pkg')
      expect(result.missingPackages).not.toContain('@types/node')
    })

    it('handles subpath imports', () => {
      const code = `
        import { Router } from 'express/router'
        import { something } from 'axios/lib/utils'
      `
      const result = validator.validate(code)
      expect(result.valid).toBe(false)
      expect(result.missingPackages).toContain('axios')
      expect(result.missingPackages).not.toContain('express')
    })

    it('ignores imports inside comments', () => {
      const code = `
        // import axios from 'axios'
        /* import { v4 } from 'uuid' */
        import { z } from 'zod'
      `
      const result = validator.validate(code)
      expect(result.valid).toBe(true)
    })

    it('provides substitution suggestions', () => {
      const code = `
        import axios from 'axios'
        import { v4 } from 'uuid'
        import _ from 'lodash'
      `
      const result = validator.validate(code)
      expect(result.suggestedFixes.length).toBe(3)
      expect(result.suggestedFixes.some((s) => s.includes('axios') && s.includes('fetch'))).toBe(true)
      expect(result.suggestedFixes.some((s) => s.includes('uuid') && s.includes('randomUUID'))).toBe(true)
      expect(result.suggestedFixes.some((s) => s.includes('lodash') && s.includes('Array'))).toBe(true)
    })

    it('provides generic suggestion for unknown packages', () => {
      const code = `import foo from 'some-unknown-pkg'`
      const result = validator.validate(code)
      expect(result.valid).toBe(false)
      expect(result.suggestedFixes[0]).toContain('implement the functionality manually')
    })

    it('handles bare import statements', () => {
      const code = `import 'zod'`
      const result = validator.validate(code)
      expect(result.valid).toBe(true)
    })

    it('validates clean code with no imports', () => {
      const code = `
        const x = 1
        console.log(x)
      `
      const result = validator.validate(code)
      expect(result.valid).toBe(true)
      expect(result.missingPackages).toEqual([])
    })
  })

  describe('validateWithConsent', () => {
    it('returns valid when all imports are installed', async () => {
      const code = `import { z } from 'zod'`
      const mockConsent = { checkBatchApproval: vi.fn().mockResolvedValue([]) }

      const result = await validator.validateWithConsent(code, mockConsent)

      expect(result.valid).toBe(true)
      expect(mockConsent.checkBatchApproval).not.toHaveBeenCalled()
    })

    it('passes missing packages through consent manager', async () => {
      const code = `import axios from 'axios'`
      const mockConsent = { checkBatchApproval: vi.fn().mockResolvedValue(['axios']) }

      const result = await validator.validateWithConsent(code, mockConsent)

      expect(result.valid).toBe(true)
      expect(result.approvedPackages).toEqual(['axios'])
      expect(result.rejectedPackages).toEqual([])
      expect(mockConsent.checkBatchApproval).toHaveBeenCalledWith(
        ['axios'],
        expect.objectContaining({ suggestedAlternatives: expect.any(Array) })
      )
    })

    it('returns rejected packages when consent is denied', async () => {
      const code = `
        import axios from 'axios'
        import _ from 'lodash'
      `
      // User approves axios but batch stops before lodash
      const mockConsent = { checkBatchApproval: vi.fn().mockResolvedValue(['axios']) }

      const result = await validator.validateWithConsent(code, mockConsent)

      expect(result.valid).toBe(false)
      expect(result.approvedPackages).toEqual(['axios'])
      expect(result.rejectedPackages).toContain('lodash')
    })

    it('rejects all when consent denies first package', async () => {
      const code = `import axios from 'axios'`
      const mockConsent = { checkBatchApproval: vi.fn().mockResolvedValue([]) }

      const result = await validator.validateWithConsent(code, mockConsent)

      expect(result.valid).toBe(false)
      expect(result.rejectedPackages).toEqual(['axios'])
    })
  })

  describe('alternatives', () => {
    it('validate() returns alternatives map for known packages', () => {
      const code = `
        import axios from 'axios'
        import { v4 } from 'uuid'
      `
      const result = validator.validate(code)
      expect(result.alternatives.size).toBe(2)
      expect(result.alternatives.get('axios')).toBeDefined()
      expect(result.alternatives.get('axios')!.module).toBe('fetch')
      expect(result.alternatives.get('uuid')!.module).toBe('node:crypto')
    })

    it('validate() returns empty alternatives for unknown packages', () => {
      const code = `import foo from 'some-unknown-pkg'`
      const result = validator.validate(code)
      expect(result.alternatives.size).toBe(0)
    })

    it('getAlternative() returns AlternativeInfo for known package', () => {
      const alt = validator.getAlternative('axios')
      expect(alt).toBeDefined()
      expect(alt!.module).toBe('fetch')
      expect(alt!.description).toContain('fetch')
      expect(alt!.example).toBeTruthy()
      expect(alt!.minNodeVersion).toBe('18.0.0')
    })

    it('getAlternative() returns undefined for unknown package', () => {
      expect(validator.getAlternative('some-unknown-pkg')).toBeUndefined()
    })

    it('SUBSTITUTION_MAP has comprehensive coverage (19+ entries)', () => {
      expect(Object.keys(SUBSTITUTION_MAP).length).toBeGreaterThanOrEqual(19)
    })
  })

  describe('ImportValidationError', () => {
    it('creates error with missing packages and suggestions', () => {
      const error = new ImportValidationError(['axios', 'lodash'], ['Use node:https', 'Use Array methods'])
      expect(error.name).toBe('ImportValidationError')
      expect(error.missingPackages).toEqual(['axios', 'lodash'])
      expect(error.suggestedFixes).toEqual(['Use node:https', 'Use Array methods'])
      expect(error.message).toContain('axios')
      expect(error.message).toContain('lodash')
    })
  })
})
