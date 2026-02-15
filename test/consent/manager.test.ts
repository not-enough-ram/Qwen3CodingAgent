import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConsentManager } from '../../src/consent/manager.js'
import { ConsentStorage } from '../../src/consent/storage.js'
import { ConsentPrompter } from '../../src/consent/prompter.js'

// Mock the storage and prompter modules
vi.mock('../../src/consent/storage.js')
vi.mock('../../src/consent/prompter.js')

describe('ConsentManager', () => {
  let manager: ConsentManager
  let mockStorage: { isApproved: ReturnType<typeof vi.fn>; addDecision: ReturnType<typeof vi.fn> }
  let mockPrompter: { prompt: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()

    mockStorage = {
      isApproved: vi.fn().mockResolvedValue(false),
      addDecision: vi.fn().mockResolvedValue(undefined),
    }

    mockPrompter = {
      prompt: vi.fn(),
      close: vi.fn(),
    }

    vi.mocked(ConsentStorage).mockImplementation(() => mockStorage as unknown as ConsentStorage)
    vi.mocked(ConsentPrompter).mockImplementation(() => mockPrompter as unknown as ConsentPrompter)

    manager = new ConsentManager('/project')
  })

  it('returns true immediately for project-approved packages', async () => {
    mockStorage.isApproved.mockResolvedValue(true)

    const result = await manager.checkApproval('axios')

    expect(result).toBe(true)
    expect(mockPrompter.prompt).not.toHaveBeenCalled()
  })

  it('returns true immediately for session-approved packages', async () => {
    // First approve with session scope
    mockPrompter.prompt.mockResolvedValueOnce({ approved: true, scope: 'session' })
    await manager.checkApproval('lodash')

    // Second call should not prompt
    const result = await manager.checkApproval('lodash')

    expect(result).toBe(true)
    expect(mockPrompter.prompt).toHaveBeenCalledTimes(1) // Only called once
  })

  it('prompts user when package is not pre-approved', async () => {
    mockPrompter.prompt.mockResolvedValueOnce({ approved: true, scope: 'once' })

    const result = await manager.checkApproval('axios')

    expect(result).toBe(true)
    expect(mockPrompter.prompt).toHaveBeenCalledTimes(1)
  })

  it('returns false when user rejects', async () => {
    mockPrompter.prompt.mockResolvedValueOnce({ approved: false, scope: 'once' })

    const result = await manager.checkApproval('axios')

    expect(result).toBe(false)
  })

  it('persists project-scope approvals to storage', async () => {
    mockPrompter.prompt.mockResolvedValueOnce({ approved: true, scope: 'project' })

    await manager.checkApproval('axios', { reason: 'HTTP client' })

    expect(mockStorage.addDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        package: 'axios',
        scope: 'project',
        reason: 'HTTP client',
      })
    )
  })

  it('adds session-scope approvals to in-memory set', async () => {
    mockPrompter.prompt.mockResolvedValueOnce({ approved: true, scope: 'session' })

    await manager.checkApproval('chalk')

    // Second call should not prompt
    mockStorage.isApproved.mockResolvedValue(false) // not project approved
    const result = await manager.checkApproval('chalk')
    expect(result).toBe(true)
    expect(mockPrompter.prompt).toHaveBeenCalledTimes(1)
  })

  it('handles useAlternative response', async () => {
    mockPrompter.prompt.mockResolvedValueOnce({
      approved: true,
      scope: 'once',
      useAlternative: 'node:https',
    })

    const result = await manager.checkApproval('axios', {
      suggestedAlternatives: ['node:https'],
    })

    expect(result).toBe(true)
  })

  describe('checkBatchApproval', () => {
    it('approves all packages sequentially', async () => {
      mockPrompter.prompt
        .mockResolvedValueOnce({ approved: true, scope: 'once' })
        .mockResolvedValueOnce({ approved: true, scope: 'once' })

      const approved = await manager.checkBatchApproval(['axios', 'lodash'])

      expect(approved).toEqual(['axios', 'lodash'])
    })

    it('stops on first rejection', async () => {
      mockPrompter.prompt
        .mockResolvedValueOnce({ approved: true, scope: 'once' })
        .mockResolvedValueOnce({ approved: false, scope: 'once' })

      const approved = await manager.checkBatchApproval(['axios', 'lodash', 'chalk'])

      expect(approved).toEqual(['axios'])
      expect(mockPrompter.prompt).toHaveBeenCalledTimes(2)
    })
  })

  describe('checkBatchApprovalWithAlternatives', () => {
    it('returns approved packages in approved array', async () => {
      mockPrompter.prompt
        .mockResolvedValueOnce({ approved: true, scope: 'once' })
        .mockResolvedValueOnce({ approved: true, scope: 'once' })

      const result = await manager.checkBatchApprovalWithAlternatives(['axios', 'lodash'])

      expect(result.approved).toEqual(['axios', 'lodash'])
      expect(result.alternatives.size).toBe(0)
      expect(result.rejected).toEqual([])
    })

    it('returns alternative selections in alternatives map', async () => {
      mockPrompter.prompt.mockResolvedValueOnce({
        approved: false,
        scope: 'once',
        useAlternative: 'node:crypto',
      })

      const result = await manager.checkBatchApprovalWithAlternatives(['uuid'])

      expect(result.approved).toEqual([])
      expect(result.alternatives.get('uuid')).toBe('node:crypto')
      expect(result.rejected).toEqual([])
    })

    it('returns rejected packages and stops batch on rejection', async () => {
      mockPrompter.prompt
        .mockResolvedValueOnce({ approved: true, scope: 'once' })
        .mockResolvedValueOnce({ approved: false, scope: 'once' })

      const result = await manager.checkBatchApprovalWithAlternatives(['axios', 'lodash', 'chalk'])

      expect(result.approved).toEqual(['axios'])
      expect(result.rejected).toEqual(['lodash'])
      expect(mockPrompter.prompt).toHaveBeenCalledTimes(2)
    })

    it('project-approved packages bypass prompt', async () => {
      mockStorage.isApproved.mockResolvedValue(true)

      const result = await manager.checkBatchApprovalWithAlternatives(['axios'])

      expect(result.approved).toEqual(['axios'])
      expect(mockPrompter.prompt).not.toHaveBeenCalled()
    })

    it('session-approved packages bypass prompt', async () => {
      // First approve with session scope
      mockPrompter.prompt.mockResolvedValueOnce({ approved: true, scope: 'session' })
      await manager.checkBatchApprovalWithAlternatives(['lodash'])

      // Second call — session approved, no prompt
      const result = await manager.checkBatchApprovalWithAlternatives(['lodash'])

      expect(result.approved).toEqual(['lodash'])
      // prompt called only once (first time)
      expect(mockPrompter.prompt).toHaveBeenCalledTimes(1)
    })

    it('passes structured alternatives and fileContext to prompter', async () => {
      mockPrompter.prompt.mockResolvedValueOnce({ approved: true, scope: 'once' })

      const alternatives = new Map([
        ['axios', { description: 'Use fetch()', module: 'fetch', example: 'fetch(url)', minNodeVersion: '18.0.0' }],
      ])
      const fileContext = new Map([['axios', ['src/api.ts', 'src/client.ts']]])

      await manager.checkBatchApprovalWithAlternatives(['axios'], { alternatives, fileContext })

      expect(mockPrompter.prompt).toHaveBeenCalledWith(
        expect.objectContaining({
          package: 'axios',
          alternatives: [alternatives.get('axios')],
          fileContext: ['src/api.ts', 'src/client.ts'],
        })
      )
    })
  })

  describe('non-interactive mode', () => {
    it('auto-rejects in non-interactive mode', async () => {
      mockPrompter.prompt.mockResolvedValue({ approved: false, scope: 'once' })
      manager.setNonInteractive(true)

      const result = await manager.checkApproval('axios')

      expect(result).toBe(false)
    })

    it('can toggle non-interactive mode', async () => {
      mockPrompter.prompt.mockResolvedValue({ approved: false, scope: 'once' })

      manager.setNonInteractive(true)
      const result = await manager.checkApproval('axios')

      expect(result).toBe(false)
    })
  })

  it('cleanup clears session approvals and closes prompter', () => {
    manager.cleanup()

    expect(mockPrompter.close).toHaveBeenCalled()
  })

  it('falls back to session mode when storage fails', async () => {
    mockStorage.isApproved.mockRejectedValueOnce(new Error('disk error'))
    mockPrompter.prompt.mockResolvedValueOnce({ approved: true, scope: 'once' })

    const result = await manager.checkApproval('axios')

    expect(result).toBe(true)
  })
})
