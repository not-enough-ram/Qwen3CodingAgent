const BUILTIN_MODULES = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster',
  'console', 'constants', 'crypto', 'dgram', 'diagnostics_channel',
  'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
  'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl',
  'stream', 'string_decoder', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
])

export type AlternativeInfo = {
  description: string
  module: string
  example: string
  minNodeVersion: string
}

export const SUBSTITUTION_MAP: Record<string, AlternativeInfo> = {
  'axios': {
    description: 'Use native fetch() for HTTP requests',
    module: 'fetch',
    example: 'const res = await fetch("https://api.example.com")',
    minNodeVersion: '18.0.0',
  },
  'node-fetch': {
    description: 'Use native fetch() for HTTP requests',
    module: 'fetch',
    example: 'const res = await fetch("https://api.example.com")',
    minNodeVersion: '18.0.0',
  },
  'got': {
    description: 'Use native fetch() for HTTP requests',
    module: 'fetch',
    example: 'const res = await fetch(url, { method: "POST", body: JSON.stringify(data) })',
    minNodeVersion: '18.0.0',
  },
  'request': {
    description: 'Use native fetch() for HTTP requests (request is deprecated)',
    module: 'fetch',
    example: 'const res = await fetch("https://api.example.com")',
    minNodeVersion: '18.0.0',
  },
  'superagent': {
    description: 'Use native fetch() for HTTP requests',
    module: 'fetch',
    example: 'const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } })',
    minNodeVersion: '18.0.0',
  },
  'uuid': {
    description: 'Use crypto.randomUUID() from node:crypto',
    module: 'node:crypto',
    example: 'import { randomUUID } from "node:crypto"; const id = randomUUID()',
    minNodeVersion: '14.17.0',
  },
  'lodash': {
    description: 'Use native Array/Object methods',
    module: 'native',
    example: 'array.map/filter/reduce, Object.keys/values/entries, structuredClone()',
    minNodeVersion: '14.0.0',
  },
  'underscore': {
    description: 'Use native Array/Object methods',
    module: 'native',
    example: 'array.map/filter/reduce, Object.keys/values/entries',
    minNodeVersion: '14.0.0',
  },
  'fs-extra': {
    description: 'Use node:fs with recursive options',
    module: 'node:fs',
    example: 'import { cpSync, mkdirSync } from "node:fs"; cpSync(src, dest, { recursive: true })',
    minNodeVersion: '16.7.0',
  },
  'mkdirp': {
    description: 'Use fs.mkdirSync with recursive option',
    module: 'node:fs',
    example: 'import { mkdirSync } from "node:fs"; mkdirSync(path, { recursive: true })',
    minNodeVersion: '10.12.0',
  },
  'rimraf': {
    description: 'Use fs.rmSync with recursive option',
    module: 'node:fs',
    example: 'import { rmSync } from "node:fs"; rmSync(path, { recursive: true, force: true })',
    minNodeVersion: '14.14.0',
  },
  'glob': {
    description: 'Use fs.globSync from node:fs',
    module: 'node:fs',
    example: 'import { globSync } from "node:fs"; const files = globSync("**/*.ts")',
    minNodeVersion: '22.0.0',
  },
  'chalk': {
    description: 'Use ANSI escape codes directly',
    module: 'native',
    example: 'console.log("\\x1b[31mred text\\x1b[0m")',
    minNodeVersion: '14.0.0',
  },
  'colors': {
    description: 'Use ANSI escape codes directly',
    module: 'native',
    example: 'console.log("\\x1b[32mgreen text\\x1b[0m")',
    minNodeVersion: '14.0.0',
  },
  'moment': {
    description: 'Use native Date and Intl.DateTimeFormat',
    module: 'native',
    example: 'new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(new Date())',
    minNodeVersion: '14.0.0',
  },
  'dayjs': {
    description: 'Use native Date and Intl.DateTimeFormat',
    module: 'native',
    example: 'new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date())',
    minNodeVersion: '14.0.0',
  },
  'path-exists': {
    description: 'Use fs.existsSync from node:fs',
    module: 'node:fs',
    example: 'import { existsSync } from "node:fs"; const exists = existsSync(path)',
    minNodeVersion: '14.0.0',
  },
  'deep-equal': {
    description: 'Use util.isDeepStrictEqual from node:util',
    module: 'node:util',
    example: 'import { isDeepStrictEqual } from "node:util"; isDeepStrictEqual(a, b)',
    minNodeVersion: '14.0.0',
  },
  'depd': {
    description: 'Use util.deprecate from node:util',
    module: 'node:util',
    example: 'import { deprecate } from "node:util"; const fn = deprecate(oldFn, "Use newFn instead")',
    minNodeVersion: '14.0.0',
  },
}

export type ImportValidationResult = {
  valid: boolean
  missingPackages: string[]
  suggestedFixes: string[]
  alternatives: Map<string, AlternativeInfo>
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

  getAlternative(pkg: string): AlternativeInfo | undefined {
    return SUBSTITUTION_MAP[pkg]
  }

  validate(code: string): ImportValidationResult {
    const imports = this.extractImports(code)
    const missingPackages: string[] = []
    const suggestedFixes: string[] = []
    const alternatives = new Map<string, AlternativeInfo>()

    for (const pkg of imports) {
      if (!this.allowedPackages.has(pkg)) {
        missingPackages.push(pkg)
        const altInfo = SUBSTITUTION_MAP[pkg]
        if (altInfo) {
          suggestedFixes.push(`${pkg}: ${altInfo.description}`)
          alternatives.set(pkg, altInfo)
        } else {
          suggestedFixes.push(`${pkg}: Remove this import or implement the functionality manually`)
        }
      }
    }

    return {
      valid: missingPackages.length === 0,
      missingPackages,
      suggestedFixes,
      alternatives,
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
