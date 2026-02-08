import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { ProjectConsentSchema, type ProjectConsent, type ConsentDecision } from './schema.js'

const CONSENT_FILENAME = '.qwen-agent-consent.json'
const MAX_DECISIONS = 100

function emptyConfig(): ProjectConsent {
  return { version: 1, approvedPackages: [], decisions: [] }
}

export class ConsentStorage {
  private configPath: string

  constructor(projectRoot: string) {
    this.configPath = join(projectRoot, CONSENT_FILENAME)
  }

  async load(): Promise<ProjectConsent> {
    try {
      const raw = await readFile(this.configPath, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      return ProjectConsentSchema.parse(parsed)
    } catch {
      return emptyConfig()
    }
  }

  async save(config: ProjectConsent): Promise<void> {
    const validated = ProjectConsentSchema.parse(config)
    const dir = dirname(this.configPath)
    try {
      await mkdir(dir, { recursive: true })
    } catch {
      // directory likely exists
    }
    await writeFile(this.configPath, JSON.stringify(validated, null, 2), 'utf-8')
  }

  async addDecision(decision: ConsentDecision): Promise<void> {
    try {
      const config = await this.load()

      if (decision.scope === 'project') {
        const approved = new Set(config.approvedPackages)
        approved.add(decision.package)
        config.approvedPackages = [...approved]
      }

      config.decisions.push(decision)
      config.decisions = config.decisions.slice(-MAX_DECISIONS)

      await this.save(config)
    } catch (e) {
      console.error('Failed to save consent decision:', e)
    }
  }

  async isApproved(packageName: string): Promise<boolean> {
    const config = await this.load()
    return config.approvedPackages.includes(packageName)
  }
}
