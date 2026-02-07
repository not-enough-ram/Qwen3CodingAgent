import { join } from 'node:path'
import type { ToolKit } from './toolkit.js'
import type { ContextConfig } from '../utils/config.js'

export type ProjectContext = {
  name: string
  language: string
  framework?: string
  dependencies: string[]
  devDependencies: string[]
  directoryTree: string
  readme?: string
}

function buildDirectoryTree(
  toolkit: ToolKit,
  path: string,
  config: ContextConfig,
  depth: number = 0,
  prefix: string = ''
): string {
  if (depth >= config.maxDirectoryDepth) {
    return ''
  }

  const result = toolkit.listDirectory(path)
  if (!result.ok) {
    return ''
  }

  const lines: string[] = []
  const entries = result.value.filter((entry) => {
    const name = entry.replace(/\/$/, '')
    return !config.ignorePatterns.some((pattern) => name === pattern || name.startsWith(`.${pattern}`))
  })

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry) continue

    const isLast = i === entries.length - 1
    const isDir = entry.endsWith('/')
    const connector = isLast ? '└── ' : '├── '
    const name = entry.replace(/\/$/, '')

    lines.push(`${prefix}${connector}${entry}`)

    if (isDir) {
      const newPrefix = prefix + (isLast ? '    ' : '│   ')
      const subtree = buildDirectoryTree(
        toolkit,
        join(path, name),
        config,
        depth + 1,
        newPrefix
      )
      if (subtree) {
        lines.push(subtree)
      }
    }
  }

  return lines.join('\n')
}

export function gatherProjectContext(
  toolkit: ToolKit,
  config: ContextConfig
): ProjectContext {
  const context: ProjectContext = {
    name: 'unknown',
    language: 'unknown',
    dependencies: [],
    devDependencies: [],
    directoryTree: '',
  }

  // Try to read package.json (Node.js projects)
  const packageJsonResult = toolkit.readFile('package.json')
  if (packageJsonResult.ok) {
    try {
      const pkg = JSON.parse(packageJsonResult.value) as {
        name?: string
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      context.name = pkg.name ?? 'unknown'
      context.language = 'typescript'  // Assume TypeScript for Node projects
      context.dependencies = Object.keys(pkg.dependencies ?? {})
      context.devDependencies = Object.keys(pkg.devDependencies ?? {})

      // Detect framework
      const allDeps = [...context.dependencies, ...context.devDependencies]
      if (allDeps.includes('next')) {
        context.framework = 'Next.js'
      } else if (allDeps.includes('express')) {
        context.framework = 'Express'
      } else if (allDeps.includes('react')) {
        context.framework = 'React'
      } else if (allDeps.includes('vue')) {
        context.framework = 'Vue'
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check for TypeScript config
  if (toolkit.fileExists('tsconfig.json')) {
    context.language = 'typescript'
  } else if (toolkit.fileExists('jsconfig.json')) {
    context.language = 'javascript'
  }

  // Build directory tree
  context.directoryTree = buildDirectoryTree(toolkit, '.', config)

  // Read README if it exists
  const readmeFiles = ['README.md', 'readme.md', 'README.txt', 'README']
  for (const readmeFile of readmeFiles) {
    const readmeResult = toolkit.readFile(readmeFile)
    if (readmeResult.ok) {
      // Truncate if too long
      const content = readmeResult.value
      context.readme = content.length > config.maxFileSize
        ? content.slice(0, config.maxFileSize) + '\n... (truncated)'
        : content
      break
    }
  }

  return context
}

export function formatProjectContext(context: ProjectContext): string {
  let output = `Project: ${context.name}\n`
  output += `Language: ${context.language}\n`

  if (context.framework) {
    output += `Framework: ${context.framework}\n`
  }

  if (context.dependencies.length > 0) {
    output += `\nDependencies: ${context.dependencies.join(', ')}\n`
  }

  output += `\nDirectory Structure:\n${context.directoryTree}\n`

  if (context.readme) {
    output += `\nREADME:\n${context.readme}\n`
  }

  return output
}
