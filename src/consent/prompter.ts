import { createInterface, type Interface } from 'node:readline'
import type { ConsentScope } from './schema.js'

export type ConsentPromptOptions = {
  package: string
  reason?: string
  suggestedAlternatives?: string[]
  nonInteractive?: boolean
}

export type ConsentResponse = {
  approved: boolean
  scope: ConsentScope
  useAlternative?: string
}

export class ConsentPrompter {
  private rl: Interface

  constructor() {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    })
  }

  async prompt(options: ConsentPromptOptions): Promise<ConsentResponse> {
    if (options.nonInteractive) {
      console.log(`\x1b[33mRunning in non-interactive mode, rejecting new dependency: ${options.package}\x1b[0m`)
      return { approved: false, scope: 'once' }
    }

    // Display header
    console.log('')
    console.log(`\x1b[33m  ⚠️  DEPENDENCY APPROVAL REQUIRED\x1b[0m`)
    console.log(`  Package: \x1b[1m${options.package}\x1b[0m`)
    if (options.reason) {
      console.log(`  Reason: ${options.reason}`)
    }

    // Show alternatives
    const alternatives = options.suggestedAlternatives ?? []
    if (alternatives.length > 0) {
      console.log('')
      console.log(`\x1b[36m  💡 Alternatives already installed:\x1b[0m`)
      for (let i = 0; i < alternatives.length; i++) {
        console.log(`     ${i + 1}. ${alternatives[i]}`)
      }
    }

    // Display options
    console.log('')
    console.log('  Options:')
    console.log('    [y] Approve once (this operation only)')
    console.log('    [s] Approve for session (until agent exits)')
    console.log('    [p] Approve for project (save to .qwen-agent-consent.json)')
    console.log('    [n] Reject (stop and fix manually)')
    if (alternatives.length > 0) {
      console.log('    [1-9] Use alternative instead')
    }
    console.log('')

    const answer = await this.ask('  Your choice [y/s/p/n]: ')
    const input = answer.toLowerCase().trim()

    // Parse numeric choice for alternatives
    const num = parseInt(input, 10)
    if (!isNaN(num) && num >= 1 && num <= alternatives.length) {
      const alt = alternatives[num - 1] as string
      console.log(`\x1b[32m  ✓ Using alternative: ${alt}\x1b[0m`)
      return { approved: true, scope: 'once', useAlternative: alt }
    }

    switch (input) {
      case 'y':
      case 'yes':
        return { approved: true, scope: 'once' }
      case 's':
      case 'session':
        return { approved: true, scope: 'session' }
      case 'p':
      case 'project':
        return { approved: true, scope: 'project' }
      case 'n':
      case 'no':
        return { approved: false, scope: 'once' }
      default:
        console.log(`\x1b[33m  Invalid input "${input}", defaulting to reject\x1b[0m`)
        return { approved: false, scope: 'once' }
    }
  }

  close(): void {
    this.rl.close()
  }

  private ask(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer)
      })
    })
  }
}
