import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createBackup,
  restoreBackup,
  cleanupBackup,
  formatInstallFailureFeedback,
  type BackupState,
} from '../../src/tools/installationBackup.js'
import type { PackageManager } from '../../src/tools/packageManager.js'
import type { InstallError } from '../../src/tools/packageInstaller.js'

describe('installationBackup', () => {
  let testDir: string

  beforeEach(() => {
    // Create unique temp directory for each test
    testDir = join(tmpdir(), `install-backup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('createBackup', () => {
    it('creates backup of package.json', () => {
      // Arrange
      const packageJsonPath = join(testDir, 'package.json')
      writeFileSync(packageJsonPath, JSON.stringify({ name: 'test', version: '1.0.0' }))

      // Act
      const backup = createBackup(testDir, 'npm')

      // Assert
      expect(backup.packageJson.path).toBe(packageJsonPath)
      expect(backup.packageJson.backupPath).toMatch(/package\.json\.backup-\d+/)
      expect(existsSync(backup.packageJson.backupPath)).toBe(true)
    })

    it('creates backup of npm lock file when present', () => {
      // Arrange
      const packageJsonPath = join(testDir, 'package.json')
      const lockFilePath = join(testDir, 'package-lock.json')
      writeFileSync(packageJsonPath, JSON.stringify({ name: 'test' }))
      writeFileSync(lockFilePath, JSON.stringify({ lockfileVersion: 2 }))

      // Act
      const backup = createBackup(testDir, 'npm')

      // Assert
      expect(backup.lockFile).not.toBeNull()
      expect(backup.lockFile?.path).toBe(lockFilePath)
      expect(backup.lockFile?.backupPath).toMatch(/package-lock\.json\.backup-\d+/)
      expect(existsSync(backup.lockFile!.backupPath)).toBe(true)
    })

    it('creates backup of pnpm lock file when present', () => {
      // Arrange
      const packageJsonPath = join(testDir, 'package.json')
      const lockFilePath = join(testDir, 'pnpm-lock.yaml')
      writeFileSync(packageJsonPath, JSON.stringify({ name: 'test' }))
      writeFileSync(lockFilePath, 'lockfileVersion: 5.4')

      // Act
      const backup = createBackup(testDir, 'pnpm')

      // Assert
      expect(backup.lockFile).not.toBeNull()
      expect(backup.lockFile?.path).toBe(lockFilePath)
      expect(backup.lockFile?.backupPath).toMatch(/pnpm-lock\.yaml\.backup-\d+/)
      expect(existsSync(backup.lockFile!.backupPath)).toBe(true)
    })

    it('creates backup of yarn lock file when present', () => {
      // Arrange
      const packageJsonPath = join(testDir, 'package.json')
      const lockFilePath = join(testDir, 'yarn.lock')
      writeFileSync(packageJsonPath, JSON.stringify({ name: 'test' }))
      writeFileSync(lockFilePath, '# yarn lockfile v1')

      // Act
      const backup = createBackup(testDir, 'yarn')

      // Assert
      expect(backup.lockFile).not.toBeNull()
      expect(backup.lockFile?.path).toBe(lockFilePath)
      expect(backup.lockFile?.backupPath).toMatch(/yarn\.lock\.backup-\d+/)
      expect(existsSync(backup.lockFile!.backupPath)).toBe(true)
    })

    it('handles missing lock file gracefully', () => {
      // Arrange
      const packageJsonPath = join(testDir, 'package.json')
      writeFileSync(packageJsonPath, JSON.stringify({ name: 'test' }))

      // Act
      const backup = createBackup(testDir, 'npm')

      // Assert
      expect(backup.packageJson.path).toBe(packageJsonPath)
      expect(backup.lockFile).toBeNull()
    })
  })

  describe('restoreBackup', () => {
    it('restores package.json from backup', () => {
      // Arrange
      const packageJsonPath = join(testDir, 'package.json')
      const originalContent = JSON.stringify({ name: 'original', version: '1.0.0' })
      writeFileSync(packageJsonPath, originalContent)

      const backup = createBackup(testDir, 'npm')

      // Modify the original file to simulate failed installation
      const modifiedContent = JSON.stringify({ name: 'modified', version: '2.0.0' })
      writeFileSync(packageJsonPath, modifiedContent)

      // Act
      restoreBackup(backup)

      // Assert
      const restoredContent = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      expect(restoredContent).toEqual({ name: 'original', version: '1.0.0' })
      expect(existsSync(backup.packageJson.backupPath)).toBe(false)
    })

    it('restores lock file from backup when present', () => {
      // Arrange
      const packageJsonPath = join(testDir, 'package.json')
      const lockFilePath = join(testDir, 'package-lock.json')
      const originalLockContent = JSON.stringify({ lockfileVersion: 2, packages: {} })

      writeFileSync(packageJsonPath, JSON.stringify({ name: 'test' }))
      writeFileSync(lockFilePath, originalLockContent)

      const backup = createBackup(testDir, 'npm')

      // Modify the lock file
      const modifiedLockContent = JSON.stringify({ lockfileVersion: 2, packages: { 'some-pkg': {} } })
      writeFileSync(lockFilePath, modifiedLockContent)

      // Act
      restoreBackup(backup)

      // Assert
      const restoredLockContent = JSON.parse(readFileSync(lockFilePath, 'utf-8'))
      expect(restoredLockContent).toEqual({ lockfileVersion: 2, packages: {} })
      expect(existsSync(backup.lockFile!.backupPath)).toBe(false)
    })

    it('is idempotent when backup files missing', () => {
      // Arrange
      const packageJsonPath = join(testDir, 'package.json')
      writeFileSync(packageJsonPath, JSON.stringify({ name: 'test' }))

      const backup: BackupState = {
        packageJson: {
          path: packageJsonPath,
          backupPath: join(testDir, 'package.json.backup-12345'),
        },
        lockFile: null,
      }

      // Act & Assert - should not throw
      expect(() => restoreBackup(backup)).not.toThrow()
    })

    it('handles missing lock file backup gracefully', () => {
      // Arrange
      const packageJsonPath = join(testDir, 'package.json')
      const lockFilePath = join(testDir, 'package-lock.json')
      writeFileSync(packageJsonPath, JSON.stringify({ name: 'test' }))

      const backup = createBackup(testDir, 'npm')

      // Delete lock backup to simulate partial state
      if (backup.lockFile) {
        rmSync(backup.lockFile.backupPath, { force: true })
      }

      // Act & Assert - should not throw
      expect(() => restoreBackup(backup)).not.toThrow()
    })
  })

  describe('cleanupBackup', () => {
    it('removes backup files after successful installation', () => {
      // Arrange
      const packageJsonPath = join(testDir, 'package.json')
      const lockFilePath = join(testDir, 'package-lock.json')
      writeFileSync(packageJsonPath, JSON.stringify({ name: 'test' }))
      writeFileSync(lockFilePath, JSON.stringify({ lockfileVersion: 2 }))

      const backup = createBackup(testDir, 'npm')

      // Act
      cleanupBackup(backup)

      // Assert
      expect(existsSync(backup.packageJson.backupPath)).toBe(false)
      expect(existsSync(backup.lockFile!.backupPath)).toBe(false)
      expect(existsSync(packageJsonPath)).toBe(true)
      expect(existsSync(lockFilePath)).toBe(true)
    })

    it('is idempotent when backups already removed', () => {
      // Arrange
      const packageJsonPath = join(testDir, 'package.json')
      writeFileSync(packageJsonPath, JSON.stringify({ name: 'test' }))

      const backup = createBackup(testDir, 'npm')
      cleanupBackup(backup)

      // Act & Assert - second cleanup should not throw
      expect(() => cleanupBackup(backup)).not.toThrow()
    })

    it('handles missing lock file backup gracefully', () => {
      // Arrange
      const packageJsonPath = join(testDir, 'package.json')
      writeFileSync(packageJsonPath, JSON.stringify({ name: 'test' }))

      const backup: BackupState = {
        packageJson: {
          path: packageJsonPath,
          backupPath: join(testDir, 'package.json.backup-12345'),
        },
        lockFile: {
          path: join(testDir, 'package-lock.json'),
          backupPath: join(testDir, 'package-lock.json.backup-12345'),
        },
      }

      // Act & Assert - should not throw even though backups don't exist
      expect(() => cleanupBackup(backup)).not.toThrow()
    })
  })

  describe('formatInstallFailureFeedback', () => {
    it('formats install_failed error with actionable feedback', () => {
      // Arrange
      const packages = ['express', 'lodash', 'axios']
      const error: InstallError = {
        type: 'install_failed',
        message: 'Package installation failed',
        exitCode: 1,
      }

      // Act
      const feedback = formatInstallFailureFeedback(packages, error, 'npm')

      // Assert
      expect(feedback).toContain('express, lodash, axios')
      expect(feedback).toContain('npm')
      expect(feedback).toContain('exit code 1')
      expect(feedback).toContain('rolled back')
      expect(feedback).toContain('Package name typo')
      expect(feedback).toContain('version conflict')
      expect(feedback).toContain('peer dependency')
      expect(feedback).toContain('Network')
      expect(feedback).toContain('Rewrite code without these packages')
    })

    it('formats execution_failed error with actionable feedback', () => {
      // Arrange
      const packages = ['some-package']
      const error: InstallError = {
        type: 'execution_failed',
        message: 'npm command not found',
      }

      // Act
      const feedback = formatInstallFailureFeedback(packages, error, 'npm')

      // Assert
      expect(feedback).toContain('Failed to execute')
      expect(feedback).toContain('npm command not found')
      expect(feedback).toContain('rolled back')
      expect(feedback).toContain('Rewrite code without')
    })

    it('formats invalid_argument error with actionable feedback', () => {
      // Arrange
      const packages = ['bad;package']
      const error: InstallError = {
        type: 'invalid_argument',
        message: 'Package name contains disallowed shell characters: bad;package',
      }

      // Act
      const feedback = formatInstallFailureFeedback(packages, error, 'npm')

      // Assert
      expect(feedback).toContain('Invalid package name')
      expect(feedback).toContain('bad;package')
      expect(feedback).toContain('Fix package name')
    })

    it('includes package manager in feedback for all error types', () => {
      // Arrange
      const packages = ['test-pkg']
      const installError: InstallError = { type: 'install_failed', message: 'Failed', exitCode: 1 }
      const execError: InstallError = { type: 'execution_failed', message: 'Not found' }
      const argError: InstallError = { type: 'invalid_argument', message: 'Invalid' }

      // Act
      const feedbacks = [
        formatInstallFailureFeedback(packages, installError, 'pnpm'),
        formatInstallFailureFeedback(packages, execError, 'yarn'),
        formatInstallFailureFeedback(packages, argError, 'npm'),
      ]

      // Assert
      expect(feedbacks[0]).toContain('pnpm')
      expect(feedbacks[1]).toContain('yarn')
      expect(feedbacks[2]).toContain('npm')
    })
  })
})
