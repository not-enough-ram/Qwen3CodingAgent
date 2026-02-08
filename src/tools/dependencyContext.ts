import type { ToolKit } from './toolkit.js'

export function buildDependencyContext(tools: ToolKit): string {
  const result = tools.readFile('package.json')
  if (!result.ok) {
    return ''
  }

  try {
    const pkg = JSON.parse(result.value) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    const lines: string[] = []

    const deps = pkg.dependencies ?? {}
    const devDeps = pkg.devDependencies ?? {}

    if (Object.keys(deps).length > 0) {
      lines.push('Production dependencies:')
      for (const [name, version] of Object.entries(deps)) {
        lines.push(`  - ${name}@${version}`)
      }
    }

    if (Object.keys(devDeps).length > 0) {
      lines.push('Dev dependencies:')
      for (const [name, version] of Object.entries(devDeps)) {
        lines.push(`  - ${name}@${version}`)
      }
    }

    if (lines.length === 0) {
      return ''
    }

    lines.unshift('Available project dependencies (only use these or Node.js built-ins):')
    return lines.join('\n')
  } catch {
    return ''
  }
}
