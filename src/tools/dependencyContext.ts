import type { ToolKit } from './toolkit.js'

const NODE_BUILTIN_MODULES = [
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster',
  'console', 'constants', 'crypto', 'dgram', 'diagnostics_channel',
  'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
  'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl',
  'stream', 'string_decoder', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
] as const

export function buildDependencyContext(toolkit: ToolKit): string {
  const packageJsonResult = toolkit.readFile('package.json')

  if (!packageJsonResult.ok) {
    return [
      'DEPENDENCY CONSTRAINTS:',
      'Could not read package.json. Use only Node.js built-in modules (import from "node:<module>").',
      'Do NOT import any third-party packages.',
    ].join('\n')
  }

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  try {
    pkg = JSON.parse(packageJsonResult.value) as typeof pkg
  } catch {
    return [
      'DEPENDENCY CONSTRAINTS:',
      'Could not parse package.json. Use only Node.js built-in modules (import from "node:<module>").',
      'Do NOT import any third-party packages.',
    ].join('\n')
  }

  const deps = Object.keys(pkg.dependencies ?? {})
  const devDeps = Object.keys(pkg.devDependencies ?? {})

  const lines: string[] = [
    'DEPENDENCY CONSTRAINTS:',
    '',
    'You MUST only import from the packages listed below or Node.js built-in modules.',
    'Do NOT import any package that is not listed here. If you need functionality from an unlisted package,',
    'use a Node.js built-in module or implement it manually.',
    '',
  ]

  if (deps.length > 0) {
    lines.push(`Installed production dependencies: ${deps.join(', ')}`)
  } else {
    lines.push('No production dependencies installed.')
  }

  if (devDeps.length > 0) {
    lines.push(`Installed dev dependencies: ${devDeps.join(', ')}`)
  }

  lines.push('')
  lines.push(`Node.js built-in modules (use "node:" prefix): ${NODE_BUILTIN_MODULES.join(', ')}`)
  lines.push('')
  lines.push('RULES:')
  lines.push('- ONLY import from the listed packages or Node.js built-in modules')
  lines.push('- Prefer built-in modules over third-party packages when possible')
  lines.push('- For HTTP requests, use "node:https" or "node:http" instead of axios/node-fetch')
  lines.push('- For UUIDs, use "node:crypto" randomUUID() instead of the uuid package')
  lines.push('- For file system operations, use "node:fs" instead of fs-extra')
  lines.push('- Do NOT invent or hallucinate package names')

  return lines.join('\n')
}
