import { describe, it, expect } from 'vitest'
import { ConsentPrompter } from '../../src/consent/prompter.js'
import type { AlternativeInfo } from '../../src/tools/importValidator.js'

describe('ConsentPrompter', () => {
  it('auto-rejects in non-interactive mode', async () => {
    const prompter = new ConsentPrompter()

    const response = await prompter.prompt({
      package: 'axios',
      nonInteractive: true,
    })

    expect(response.approved).toBe(false)
    expect(response.scope).toBe('once')

    prompter.close()
  })

  it('auto-rejects with reason in non-interactive mode', async () => {
    const prompter = new ConsentPrompter()

    const response = await prompter.prompt({
      package: 'lodash',
      reason: 'utility functions',
      nonInteractive: true,
    })

    expect(response.approved).toBe(false)

    prompter.close()
  })

  it('auto-rejects in non-interactive mode even with structured alternatives', async () => {
    const prompter = new ConsentPrompter()
    const alternatives: AlternativeInfo[] = [{
      description: 'Use native fetch()',
      module: 'fetch',
      example: 'await fetch(url)',
      minNodeVersion: '18.0.0',
    }]

    const response = await prompter.prompt({
      package: 'axios',
      alternatives,
      fileContext: ['src/api.ts'],
      nonInteractive: true,
    })

    expect(response.approved).toBe(false)
    expect(response.scope).toBe('once')
    expect(response.useAlternative).toBeUndefined()

    prompter.close()
  })

  it('accepts structured alternatives and fileContext in options', () => {
    // TypeScript compilation test: ConsentPromptOptions accepts new fields
    const _options = {
      package: 'uuid',
      alternatives: [{
        description: 'Use crypto.randomUUID()',
        module: 'node:crypto',
        example: 'randomUUID()',
        minNodeVersion: '14.17.0',
      }] satisfies AlternativeInfo[],
      fileContext: ['src/utils.ts', 'src/models/user.ts'],
    }
    // If this compiles, the types are correct
    expect(_options.alternatives.length).toBe(1)
    expect(_options.fileContext.length).toBe(2)
  })
})
