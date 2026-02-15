import { copyFileSync, renameSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PackageManager } from './packageManager.js'
import type { InstallError } from './packageInstaller.js'

export type BackupState = {
  packageJson: { path: string; backupPath: string }
  lockFile: { path: string; backupPath: string } | null
}

/**
 * Lock file names for each package manager.
 */
const LOCK_FILES: Record<PackageManager, string> = {
  npm: 'package-lock.json',
  pnpm: 'pnpm-lock.yaml',
  yarn: 'yarn.lock',
}

/**
 * Creates backups of package.json and lock file before installation.
 * Uses synchronous operations to ensure backup completes before installation starts.
 *
 * @param projectRoot - The root directory of the project
 * @param pm - The package manager being used
 * @returns BackupState with paths to original and backup files
 */
export function createBackup(projectRoot: string, pm: PackageManager): BackupState {
  const timestamp = Date.now()
  const packageJsonPath = join(projectRoot, 'package.json')
  const packageJsonBackup = `${packageJsonPath}.backup-${timestamp}`

  // Always backup package.json
  copyFileSync(packageJsonPath, packageJsonBackup)

  // Backup lock file if it exists
  const lockFileName = LOCK_FILES[pm]
  const lockFilePath = join(projectRoot, lockFileName)
  let lockFileBackup: { path: string; backupPath: string } | null = null

  if (existsSync(lockFilePath)) {
    const backupPath = `${lockFilePath}.backup-${timestamp}`
    copyFileSync(lockFilePath, backupPath)
    lockFileBackup = { path: lockFilePath, backupPath }
  }

  return {
    packageJson: { path: packageJsonPath, backupPath: packageJsonBackup },
    lockFile: lockFileBackup,
  }
}

/**
 * Restores package.json and lock file from backup.
 * Uses renameSync which is atomic on Unix systems.
 * Idempotent - safe to call even if backup files don't exist.
 *
 * @param backup - The BackupState from createBackup
 */
export function restoreBackup(backup: BackupState): void {
  // Restore package.json if backup exists
  if (existsSync(backup.packageJson.backupPath)) {
    renameSync(backup.packageJson.backupPath, backup.packageJson.path)
  }

  // Restore lock file if backup exists
  if (backup.lockFile && existsSync(backup.lockFile.backupPath)) {
    renameSync(backup.lockFile.backupPath, backup.lockFile.path)
  }
}

/**
 * Removes backup files after successful installation.
 * Idempotent - safe to call even if backup files already removed.
 *
 * @param backup - The BackupState from createBackup
 */
export function cleanupBackup(backup: BackupState): void {
  // Remove package.json backup if it exists
  if (existsSync(backup.packageJson.backupPath)) {
    unlinkSync(backup.packageJson.backupPath)
  }

  // Remove lock file backup if it exists
  if (backup.lockFile && existsSync(backup.lockFile.backupPath)) {
    unlinkSync(backup.lockFile.backupPath)
  }
}

/**
 * Formats installation failure into actionable feedback for coder retry.
 * Includes package names, error context, rollback confirmation, and suggested actions.
 *
 * @param packages - The packages that failed to install
 * @param error - The InstallError from packageInstaller
 * @param pm - The package manager used
 * @returns Formatted feedback string for coder agent
 */
export function formatInstallFailureFeedback(
  packages: string[],
  error: InstallError,
  pm: PackageManager
): string {
  const lines: string[] = []

  switch (error.type) {
    case 'install_failed':
      lines.push(`Package installation failed (${pm} exit code ${error.exitCode}).`)
      lines.push(`Packages: ${packages.join(', ')}`)
      lines.push('')
      lines.push('Project state has been rolled back to before installation attempt.')
      lines.push('')
      lines.push('Possible causes:')
      lines.push('- Package name typo or does not exist on registry')
      lines.push('- version conflict with existing dependencies')
      lines.push('- peer dependency requirements not met')
      lines.push('- Network connectivity issues or registry timeout')
      lines.push('')
      lines.push('Action: Rewrite code without these packages or use built-in alternatives.')
      break

    case 'execution_failed':
      lines.push(`Failed to execute package manager (${pm}): ${error.message}`)
      lines.push('')
      lines.push('Project state has been rolled back.')
      lines.push('')
      lines.push('Action: Rewrite code without external packages.')
      break

    case 'invalid_argument':
      lines.push(`Invalid package name (${pm}): ${error.message}`)
      lines.push('')
      lines.push('Action: Fix package name or remove dependency.')
      break
  }

  return lines.join('\n')
}
