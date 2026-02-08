import type { ConsentManager } from '../consent/index.js'

export type ValidationResult = {
  valid: boolean
  missingPackages: string[]
  suggestedFixes: string[]
}

export type ConsentValidationResult = {
  valid: boolean
  rejectedPackages: string[]
}

const NODE_BUILTIN_MODULES = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster',
  'console', 'constants', 'crypto', 'dgram', 'diagnostics_channel',
  'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
  'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl',
  'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
])

function extractImportedPackages(content: string): string[] {
  const packages: string[] = []
  const importRegex = /(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g

  let match: RegExpExecArray | null
  while ((match = importRegex.exec(content)) !== null) {
    const specifier = match[1] ?? match[2]
    if (!specifier) continue

    // Skip relative imports
    if (specifier.startsWith('.') || specifier.startsWith('/')) continue

    // Skip node: protocol builtins
    if (specifier.startsWith('node:')) continue

    // Skip bare Node.js builtins
    const baseName = specifier.split('/')[0]!
    if (NODE_BUILTIN_MODULES.has(baseName)) continue

    // Extract package name (handle scoped packages)
    const packageName = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : baseName

    packages.push(packageName)
  }

  return [...new Set(packages)]
}

export class ImportValidator {
  private allowedPackages: Set<string>

  constructor(dependencies: string[], devDependencies: string[]) {
    this.allowedPackages = new Set([...dependencies, ...devDependencies])
  }

  validate(content: string): ValidationResult {
    const importedPackages = extractImportedPackages(content)
    const missingPackages = importedPackages.filter((pkg) => !this.allowedPackages.has(pkg))

    const suggestedFixes = missingPackages.map((pkg) => {
      return `${pkg}: Remove this import and use an installed package or Node.js built-in instead`
    })

    return {
      valid: missingPackages.length === 0,
      missingPackages,
      suggestedFixes,
    }
  }

  async validateWithConsent(
    content: string,
    consentManager: ConsentManager
  ): Promise<ConsentValidationResult> {
    const importedPackages = extractImportedPackages(content)
    const unknownPackages = importedPackages.filter((pkg) => !this.allowedPackages.has(pkg))

    if (unknownPackages.length === 0) {
      return { valid: true, rejectedPackages: [] }
    }

    const rejectedPackages: string[] = []

    for (const pkg of unknownPackages) {
      const approved = await consentManager.requestConsent(
        'import_package',
        `Allow importing package "${pkg}" which is not in project dependencies?`
      )
      if (!approved) {
        rejectedPackages.push(pkg)
      }
    }

    return {
      valid: rejectedPackages.length === 0,
      rejectedPackages,
    }
  }
}
