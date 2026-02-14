import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Result, ok, err } from '../utils/result.js'

export type PackageManager = 'npm' | 'pnpm' | 'yarn'

export type DetectionError = {
  type: 'multiple_lock_files'
  found: PackageManager[]
  message: string
}

export type DetectionResult = Result<PackageManager, DetectionError>

/**
 * Detects the package manager used by a project.
 *
 * Priority order:
 * 1. Lock files (pnpm-lock.yaml -> pnpm, package-lock.json -> npm, yarn.lock -> yarn)
 * 2. package.json packageManager field (corepack support)
 * 3. Default to npm
 *
 * @param projectRoot - The root directory of the project to analyze
 * @returns Result containing the detected package manager or an error if multiple lock files exist
 */
export function detectPackageManager(projectRoot: string): DetectionResult {
  // Check for lock files first (highest priority)
  const lockFiles = [
    { file: 'pnpm-lock.yaml', pm: 'pnpm' as PackageManager },
    { file: 'package-lock.json', pm: 'npm' as PackageManager },
    { file: 'yarn.lock', pm: 'yarn' as PackageManager },
  ]

  const foundLockFiles = lockFiles.filter(({ file }) =>
    existsSync(join(projectRoot, file))
  )

  // If multiple lock files exist, return an error
  if (foundLockFiles.length > 1) {
    return err({
      type: 'multiple_lock_files',
      found: foundLockFiles.map(({ pm }) => pm),
      message: `Multiple package manager lock files detected: ${foundLockFiles
        .map(({ file }) => file)
        .join(', ')}. Please remove all but one to avoid conflicts.`,
    })
  }

  // If exactly one lock file exists, use it
  if (foundLockFiles.length === 1 && foundLockFiles[0]) {
    return ok(foundLockFiles[0].pm)
  }

  // No lock files - check package.json packageManager field
  const packageJsonPath = join(projectRoot, 'package.json')
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

      if (packageJson.packageManager) {
        // Parse packageManager field format: "pnpm@8.6.0" or "npm@10.0.0+sha224.abc123"
        const pmName = packageJson.packageManager.split('@')[0]

        if (pmName === 'pnpm' || pmName === 'npm' || pmName === 'yarn') {
          return ok(pmName)
        }
      }
    } catch {
      // If package.json is corrupt or unreadable, fall through to default
    }
  }

  // Default to npm when nothing else is detected
  return ok('npm')
}
