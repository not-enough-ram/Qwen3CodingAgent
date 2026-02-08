import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConsentStorage } from '../../src/consent/storage.js'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('ConsentStorage', () => {
  let tempDir: string
  let storage: ConsentStorage

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'consent-test-'))
    storage = new ConsentStorage(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('returns empty config when no file exists', async () => {
    const config = await storage.load()
    expect(config.version).toBe(1)
    expect(config.approvedPackages).toEqual([])
    expect(config.decisions).toEqual([])
  })

  it('saves and loads project consent', async () => {
    await storage.save({
      version: 1,
      approvedPackages: ['axios'],
      decisions: [{
        package: 'axios',
        scope: 'project',
        timestamp: new Date().toISOString(),
      }],
    })

    const config = await storage.load()
    expect(config.approvedPackages).toEqual(['axios'])
    expect(config.decisions.length).toBe(1)
  })

  it('writes valid JSON to disk', async () => {
    await storage.save({
      version: 1,
      approvedPackages: ['zod'],
      decisions: [],
    })

    const raw = await readFile(join(tempDir, '.qwen-agent-consent.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.version).toBe(1)
    expect(parsed.approvedPackages).toEqual(['zod'])
  })

  it('addDecision adds project-scope package to approvedPackages', async () => {
    await storage.addDecision({
      package: 'lodash',
      scope: 'project',
      timestamp: new Date().toISOString(),
      reason: 'needed for utilities',
    })

    const approved = await storage.isApproved('lodash')
    expect(approved).toBe(true)
  })

  it('addDecision does not add session-scope to approvedPackages', async () => {
    await storage.addDecision({
      package: 'chalk',
      scope: 'session',
      timestamp: new Date().toISOString(),
    })

    const approved = await storage.isApproved('chalk')
    expect(approved).toBe(false)
  })

  it('addDecision deduplicates approvedPackages', async () => {
    await storage.addDecision({
      package: 'axios',
      scope: 'project',
      timestamp: new Date().toISOString(),
    })
    await storage.addDecision({
      package: 'axios',
      scope: 'project',
      timestamp: new Date().toISOString(),
    })

    const config = await storage.load()
    expect(config.approvedPackages.filter((p) => p === 'axios').length).toBe(1)
  })

  it('limits decisions to 100 entries', async () => {
    for (let i = 0; i < 110; i++) {
      await storage.addDecision({
        package: `pkg-${i}`,
        scope: 'once',
        timestamp: new Date().toISOString(),
      })
    }

    const config = await storage.load()
    expect(config.decisions.length).toBeLessThanOrEqual(100)
  })

  it('isApproved returns false for unknown packages', async () => {
    const approved = await storage.isApproved('nonexistent')
    expect(approved).toBe(false)
  })

  it('gracefully handles corrupt file', async () => {
    const { writeFile: writeFileFs } = await import('node:fs/promises')
    await writeFileFs(join(tempDir, '.qwen-agent-consent.json'), 'not json', 'utf-8')

    const config = await storage.load()
    expect(config.version).toBe(1)
    expect(config.approvedPackages).toEqual([])
  })
})
