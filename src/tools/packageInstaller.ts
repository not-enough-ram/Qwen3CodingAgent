import { spawn } from 'node:child_process'
import type { PackageManager } from './packageManager.js'
import { type Result, ok, err } from '../utils/result.js'

export type InstallResult = {
  success: boolean
  packages: string[]
  packageManager: PackageManager
}

export type InstallError = {
  type: 'install_failed' | 'execution_failed' | 'invalid_argument'
  message: string
  exitCode?: number
}

// Shared regex for shell metacharacters (same as toolkit.ts)
const SHELL_META = /[;&|`$(){}!<>\\'"\n\r]/

/**
 * Builds install command arguments for a given package manager.
 * Exported for testing.
 */
export function buildInstallArgs(
  pm: PackageManager,
  packages: string[],
  category: 'dev' | 'prod' = 'prod'
): string[] {
  switch (pm) {
    case 'npm':
      return category === 'dev'
        ? ['install', '--save-dev', ...packages]
        : ['install', '--save', ...packages]
    case 'pnpm':
      return category === 'dev'
        ? ['add', '-D', ...packages]
        : ['add', ...packages]
    case 'yarn':
      return category === 'dev'
        ? ['add', '--dev', ...packages]
        : ['add', ...packages]
  }
}

/**
 * Installs packages using the detected package manager.
 * Uses spawn() with shell: false for security and stdio: 'inherit' for real-time output.
 */
export async function installPackages(options: {
  packageManager: PackageManager
  packages: string[]
  projectRoot: string
  category?: 'dev' | 'prod'
}): Promise<Result<InstallResult, InstallError>> {
  const { packageManager, packages, projectRoot, category = 'prod' } = options

  // Validate package names don't contain shell metacharacters (defense in depth)
  for (const pkg of packages) {
    if (SHELL_META.test(pkg)) {
      return err({
        type: 'invalid_argument',
        message: `Package name contains disallowed shell characters: ${pkg}`,
      })
    }
  }

  const args = buildInstallArgs(packageManager, packages, category)

  return new Promise((resolve) => {
    const child = spawn(packageManager, args, {
      cwd: projectRoot,
      stdio: 'inherit', // Real-time output to console
      shell: false, // CRITICAL: prevent shell injection
    })

    child.on('error', (error) => {
      resolve(
        err({
          type: 'execution_failed',
          message: `Failed to execute ${packageManager}: ${error.message}`,
        })
      )
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve(
          ok({
            success: true,
            packages,
            packageManager,
          })
        )
      } else {
        resolve(
          err({
            type: 'install_failed',
            message: `Package installation failed with exit code ${code}`,
            exitCode: code ?? 1,
          })
        )
      }
    })
  })
}
