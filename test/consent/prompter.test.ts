import { describe, it, expect } from 'vitest'
import { ConsentPrompter } from '../../src/consent/prompter.js'

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
})
