import { createInterface } from 'node:readline'

export type ConsentOptions = {
  nonInteractive?: boolean
}

export class ConsentManager {
  private projectRoot: string
  private nonInteractive: boolean
  private decisions: Map<string, boolean> = new Map()
  private rl: ReturnType<typeof createInterface> | null = null

  constructor(projectRoot: string, options: ConsentOptions = {}) {
    this.projectRoot = projectRoot
    this.nonInteractive = options.nonInteractive ?? false
  }

  async requestConsent(action: string, message: string): Promise<boolean> {
    const key = `${action}:${message}`

    // Check cached decisions
    const cached = this.decisions.get(key)
    if (cached !== undefined) {
      return cached
    }

    // In non-interactive mode, deny by default
    if (this.nonInteractive) {
      this.decisions.set(key, false)
      return false
    }

    const answer = await this.prompt(`${message} [y/N] `)
    const approved = answer === 'y' || answer === 'yes'
    this.decisions.set(key, approved)
    return approved
  }

  private prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      this.rl.question(question, (answer) => {
        this.rl?.close()
        this.rl = null
        resolve(answer.toLowerCase().trim())
      })
    })
  }

  cleanup(): void {
    if (this.rl) {
      this.rl.close()
      this.rl = null
    }
    this.decisions.clear()
  }
}
