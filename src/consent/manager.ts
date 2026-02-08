import { ConsentStorage } from './storage.js'
import { ConsentPrompter, type ConsentPromptOptions } from './prompter.js'
import type { ConsentDecision } from './schema.js'

export class ConsentManager {
  private storage: ConsentStorage
  private prompter: ConsentPrompter
  private sessionApprovals: Set<string>
  private nonInteractive: boolean

  constructor(projectRoot: string, options?: { nonInteractive?: boolean }) {
    this.storage = new ConsentStorage(projectRoot)
    this.prompter = new ConsentPrompter()
    this.sessionApprovals = new Set()
    this.nonInteractive = options?.nonInteractive ?? false
  }

  async checkApproval(packageName: string, options?: Partial<ConsentPromptOptions>): Promise<boolean> {
    // 1. Project-level check
    try {
      if (await this.storage.isApproved(packageName)) {
        console.log(`  \x1b[32m✓ ${packageName} (project-approved)\x1b[0m`)
        return true
      }
    } catch (e) {
      console.error('Failed to check project approvals, falling back to session mode:', e)
    }

    // 2. Session-level check
    if (this.sessionApprovals.has(packageName)) {
      console.log(`  \x1b[32m✓ ${packageName} (session-approved)\x1b[0m`)
      return true
    }

    // 3. Interactive prompt
    const response = await this.prompter.prompt({
      package: packageName,
      ...options,
      nonInteractive: this.nonInteractive,
    })

    if (!response.approved) {
      return false
    }

    if (response.useAlternative) {
      console.log(`  \x1b[36m→ Substitute ${packageName} with ${response.useAlternative}\x1b[0m`)
      return true
    }

    // 4. Record decision
    const decision: ConsentDecision = {
      package: packageName,
      scope: response.scope,
      timestamp: new Date().toISOString(),
      reason: options?.reason,
    }

    if (response.scope === 'session') {
      this.sessionApprovals.add(packageName)
    }

    if (response.scope === 'project') {
      try {
        await this.storage.addDecision(decision)
      } catch (e) {
        console.error('Failed to persist project approval, using session scope instead:', e)
        this.sessionApprovals.add(packageName)
      }
    }

    console.log(`  \x1b[32m✓ ${packageName} approved (${response.scope})\x1b[0m`)
    return true
  }

  async checkBatchApproval(packages: string[], options?: Partial<ConsentPromptOptions>): Promise<string[]> {
    const approved: string[] = []

    for (const pkg of packages) {
      const result = await this.checkApproval(pkg, options)
      if (result) {
        approved.push(pkg)
      } else {
        console.log(`  \x1b[31m✗ ${pkg} rejected - stopping batch approval\x1b[0m`)
        break
      }
    }

    return approved
  }

  setNonInteractive(value: boolean): void {
    this.nonInteractive = value
  }

  cleanup(): void {
    this.prompter.close()
    this.sessionApprovals.clear()
  }
}
