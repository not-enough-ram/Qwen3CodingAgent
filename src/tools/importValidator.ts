const BUILTIN_MODULES = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster',
  'console', 'constants', 'crypto', 'dgram', 'diagnostics_channel',
  'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
  'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl',
  'stream', 'string_decoder', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
])

const SUBSTITUTION_MAP: Record<string, string> = {
  'axios': 'Use node:https or node:http for HTTP requests',
  'node-fetch': 'Use node:https or node:http for HTTP requests',
  'got': 'Use node:https or node:http for HTTP requests',
  'request': 'Use node:https or node:http for HTTP requests',
  'superagent': 'Use node:https or node:http for HTTP requests',
  'uuid': 'Use crypto.randomUUID() from node:crypto',
  'lodash': 'Use native Array/Object methods',
  'underscore': 'Use native Array/Object methods',
  'fs-extra': 'Use node:fs with recursive options',
  'mkdirp': 'Use fs.mkdirSync(path, { recursive: true }) from node:fs',
  'rimraf': 'Use fs.rmSync(path, { recursive: true }) from node:fs',
  'glob': 'Use fs.readdirSync with recursion or node:fs/promises',
  'chalk': 'Use ANSI escape codes directly or no coloring',
  'colors': 'Use ANSI escape codes directly or no coloring',
  'moment': 'Use native Date and Intl.DateTimeFormat',
  'dayjs': 'Use native Date and Intl.DateTimeFormat',
  'path-exists': 'Use fs.existsSync() from node:fs',
}

export type ImportValidationResult = {
  valid: boolean
  missingPackages: string[]
  suggestedFixes: string[]
}

export class ImportValidationError extends Error {
  missingPackages: string[]
  suggestedFixes: string[]

  constructor(missingPackages: string[], suggestedFixes: string[]) {
    const msg = `Forbidden imports detected: ${missingPackages.join(', ')}`
    super(msg)
    this.name = 'ImportValidationError'
    this.missingPackages = missingPackages
    this.suggestedFixes = suggestedFixes
  }
}

export type ConsentValidationResult = {
  valid: boolean
  rejectedPackages: string[]
  approvedPackages: string[]
}

type ConsentManagerLike = {
  checkBatchApproval(packages: string[], options?: { suggestedAlternatives?: string[] }): Promise<string[]>
}

export class ImportValidator {
  private allowedPackages: Set<string>

  constructor(dependencies: string[], devDependencies: string[]) {
    this.allowedPackages = new Set([...dependencies, ...devDependencies])
  }

  private extractImports(code: string): Set<string> {
    // Strip block comments
    let stripped = code.replace(/\/\*[\s\S]*?\*\//g, '')
    // Strip line comments
    stripped = stripped.replace(/\/\/.*$/gm, '')

    const packages = new Set<string>()

    // ES6 static imports: import ... from 'pkg' or import 'pkg'
    const es6Pattern = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
    let match: RegExpExecArray | null
    while ((match = es6Pattern.exec(stripped)) !== null) {
      const specifier = match[1]
      if (specifier) packages.add(specifier)
    }

    // CommonJS require: require('pkg')
    const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    while ((match = requirePattern.exec(stripped)) !== null) {
      const specifier = match[1]
      if (specifier) packages.add(specifier)
    }

    // Dynamic import: import('pkg')
    const dynamicPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    while ((match = dynamicPattern.exec(stripped)) !== null) {
      const specifier = match[1]
      if (specifier) packages.add(specifier)
    }

    // Filter and extract package names
    const result = new Set<string>()
    for (const specifier of packages) {
      // Skip relative imports
      if (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')) {
        continue
      }

      // Skip node: prefixed builtins
      if (specifier.startsWith('node:')) {
        continue
      }

      // Extract package name (handle @scope/pkg and pkg/subpath)
      let pkgName: string
      if (specifier.startsWith('@')) {
        const parts = specifier.split('/')
        pkgName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier
      } else {
        pkgName = specifier.split('/')[0] ?? specifier
      }

      // Skip known builtins (without node: prefix)
      if (BUILTIN_MODULES.has(pkgName)) {
        continue
      }

      result.add(pkgName)
    }

    return result
  }

  validate(code: string): ImportValidationResult {
    const imports = this.extractImports(code)
    const missingPackages: string[] = []
    const suggestedFixes: string[] = []

    for (const pkg of imports) {
      if (!this.allowedPackages.has(pkg)) {
        missingPackages.push(pkg)
        const suggestion = SUBSTITUTION_MAP[pkg]
        if (suggestion) {
          suggestedFixes.push(`${pkg}: ${suggestion}`)
        } else {
          suggestedFixes.push(`${pkg}: Remove this import or implement the functionality manually`)
        }
      }
    }

    return {
      valid: missingPackages.length === 0,
      missingPackages,
      suggestedFixes,
    }
  }

  async validateWithConsent(
    code: string,
    consentManager: ConsentManagerLike
  ): Promise<ConsentValidationResult> {
    const validation = this.validate(code)

    if (validation.valid) {
      return { valid: true, rejectedPackages: [], approvedPackages: [] }
    }

    const alternatives = validation.suggestedFixes
      .map((fix) => {
        const match = fix.match(/: (.+)/)
        return match?.[1]
      })
      .filter((alt): alt is string => !!alt)

    const approvedPackages = await consentManager.checkBatchApproval(
      validation.missingPackages,
      { suggestedAlternatives: alternatives }
    )

    const rejectedPackages = validation.missingPackages.filter(
      (pkg) => !approvedPackages.includes(pkg)
    )

    return {
      valid: rejectedPackages.length === 0,
      rejectedPackages,
      approvedPackages,
    }
  }
}
