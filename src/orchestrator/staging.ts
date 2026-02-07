import type { FileChange } from '../schemas/coder.js'
import type { ToolKit } from '../tools/toolkit.js'
import { type Result, ok, err, all } from '../utils/result.js'

export type StagedChange = {
  path: string
  content: string
  isNew: boolean
  originalContent?: string | undefined
}

export type StagingResult = {
  changes: StagedChange[]
  applied: boolean
}

/**
 * Stage changes without applying them
 */
export function stageChanges(
  changes: FileChange[],
  tools: ToolKit
): StagedChange[] {
  return changes.map((change) => {
    const existingResult = tools.readFile(change.path)
    return {
      path: change.path,
      content: change.content,
      isNew: !existingResult.ok,
      originalContent: existingResult.ok ? existingResult.value : undefined,
    }
  })
}

/**
 * Apply staged changes to the filesystem
 */
export function applyChanges(
  staged: StagedChange[],
  tools: ToolKit
): Result<void, string> {
  const results = staged.map((change) => {
    const result = tools.writeFile(change.path, change.content)
    if (!result.ok) {
      return err(`Failed to write ${change.path}: ${result.error.message}`)
    }
    return ok(undefined)
  })

  const combined = all(results)
  if (!combined.ok) {
    return combined
  }

  return ok(undefined)
}

/**
 * Generate a simple unified diff for display
 */
export function generateDiff(staged: StagedChange): string {
  const lines: string[] = []

  if (staged.isNew) {
    lines.push(`+++ ${staged.path} (new file)`)
    const contentLines = staged.content.split('\n')
    for (const line of contentLines) {
      lines.push(`+ ${line}`)
    }
  } else if (staged.originalContent) {
    lines.push(`--- ${staged.path}`)
    lines.push(`+++ ${staged.path}`)

    const originalLines = staged.originalContent.split('\n')
    const newLines = staged.content.split('\n')

    // Simple line-by-line diff (not a real unified diff algorithm)
    const maxLines = Math.max(originalLines.length, newLines.length)
    for (let i = 0; i < maxLines; i++) {
      const origLine = originalLines[i]
      const newLine = newLines[i]

      if (origLine === newLine) {
        if (origLine !== undefined) {
          lines.push(`  ${origLine}`)
        }
      } else {
        if (origLine !== undefined) {
          lines.push(`- ${origLine}`)
        }
        if (newLine !== undefined) {
          lines.push(`+ ${newLine}`)
        }
      }
    }
  }

  return lines.join('\n')
}

/**
 * Format a summary of changes for display
 */
export function formatChangesSummary(staged: StagedChange[]): string {
  const lines: string[] = ['Changes:']

  for (const change of staged) {
    const lineCount = change.content.split('\n').length
    if (change.isNew) {
      lines.push(`  + ${change.path} (new, ${lineCount} lines)`)
    } else {
      const origLines = change.originalContent?.split('\n').length ?? 0
      const diff = lineCount - origLines
      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`
      lines.push(`  ~ ${change.path} (modified, ${diffStr} lines)`)
    }
  }

  return lines.join('\n')
}
