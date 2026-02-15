# Phase 4: Installation Safety & Recovery - Research

**Researched:** 2026-02-15
**Domain:** Installation failure detection, rollback mechanisms, atomic file operations, error recovery
**Confidence:** HIGH

## Summary

Phase 4 implements safety mechanisms to detect installation failures and rollback project state when package installations fail. The research reveals that **most failure detection infrastructure already exists** through the Result<T, E> pattern and spawn exit code handling in packageInstaller.ts. The primary gaps are: (1) backup creation before installation, (2) rollback restoration on failure, and (3) feedback propagation to coder about failed installations.

The codebase already captures install failures through exit codes and spawn errors (installPackages returns Result<InstallResult, InstallError>), and the pipeline already has sequential prod-then-dev installation with separate tracking (installedProd/installedDev arrays). The missing pieces are state preservation (backing up package.json and lock files before install) and restoration (rolling back on failure).

Node.js provides sufficient built-in capabilities for atomic-like operations: fs.copyFileSync() for backup creation and fs.renameSync() for atomic restoration (on Unix systems). The pattern is: (1) backup → (2) install → (3) on failure, restore backup → (4) provide feedback to coder with failure reason.

**Primary recommendation:** Implement backup/restore around existing installPackages() calls in pipeline.ts using synchronous fs operations. Create backups before sequential installation attempts, restore on any failure, and enhance coder feedback to include installation failure context. No new dependencies needed.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:fs | Built-in | File backup/restore operations | Native synchronous operations (copyFileSync, renameSync, unlinkSync) are atomic on Unix |
| node:child_process | Built-in | Spawn package manager processes | Already used in packageInstaller.ts with exit code detection |
| Result<T, E> pattern | Custom | Error handling without exceptions | Already implemented in utils/result.ts, used throughout codebase |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| packageInstaller.ts | Custom | Install packages with PM detection | Already returns Result<InstallResult, InstallError> with exit codes |
| packageManager.ts | Custom | Detect npm/pnpm/yarn | Already used in pipeline for PM selection |
| Logger | Custom | Structured logging | Already used in pipeline for installation tracking |

### Not Needed
| Alternative | Why Not | What to Use Instead |
|-------------|---------|---------------------|
| fs-extra | Overkill for simple copy/rename | Native fs.copyFileSync/renameSync sufficient |
| write-file-atomic | Already have backup/restore pattern | fs operations in correct sequence provide safety |
| rimraf | Node 12.10+ has fs.rm({ recursive: true }) | Native recursive delete if needed |
| tmp/temp | Don't need temp directories | Backup files in same directory with .backup suffix |

**Installation:**
No new dependencies required. All features can be implemented with Node.js built-ins and existing code.

## Architecture Patterns

### Pattern 1: Backup Before Install, Restore on Failure

**What:** Create backup of package.json and lock file before installation, restore on failure

**When to use:** Before any installPackages() call that modifies project dependencies

**Example:**
```typescript
// Atomic backup/restore pattern for installation safety
type BackupState = {
  packageJson: { path: string; backupPath: string }
  lockFile: { path: string; backupPath: string } | null
}

async function installWithRollback(
  packages: string[],
  pm: PackageManager,
  projectRoot: string,
  category: 'prod' | 'dev'
): Promise<Result<InstallResult, InstallError>> {
  // Step 1: Create backups
  const backup = createBackups(projectRoot, pm)

  // Step 2: Attempt installation
  const installResult = await installPackages({
    packageManager: pm,
    packages,
    projectRoot,
    category,
  })

  // Step 3: Handle result
  if (installResult.ok) {
    // Success - remove backups
    cleanupBackups(backup)
    return installResult
  } else {
    // Failure - restore backups
    restoreBackups(backup)
    return installResult  // Propagate error with rollback complete
  }
}

function createBackups(projectRoot: string, pm: PackageManager): BackupState {
  const packageJsonPath = join(projectRoot, 'package.json')
  const packageJsonBackup = `${packageJsonPath}.backup`

  // Backup package.json (always exists)
  fs.copyFileSync(packageJsonPath, packageJsonBackup)

  // Backup lock file (if exists)
  const lockFile = getLockFilePath(projectRoot, pm)
  let lockFileBackup: { path: string; backupPath: string } | null = null

  if (lockFile && fs.existsSync(lockFile)) {
    const backupPath = `${lockFile}.backup`
    fs.copyFileSync(lockFile, backupPath)
    lockFileBackup = { path: lockFile, backupPath }
  }

  return {
    packageJson: { path: packageJsonPath, backupPath: packageJsonBackup },
    lockFile: lockFileBackup,
  }
}

function restoreBackups(backup: BackupState): void {
  // Restore package.json (fs.renameSync is atomic on Unix)
  if (fs.existsSync(backup.packageJson.backupPath)) {
    fs.renameSync(backup.packageJson.backupPath, backup.packageJson.path)
  }

  // Restore lock file
  if (backup.lockFile && fs.existsSync(backup.lockFile.backupPath)) {
    fs.renameSync(backup.lockFile.backupPath, backup.lockFile.path)
  }
}

function cleanupBackups(backup: BackupState): void {
  // Remove backup files after successful installation
  if (fs.existsSync(backup.packageJson.backupPath)) {
    fs.unlinkSync(backup.packageJson.backupPath)
  }

  if (backup.lockFile && fs.existsSync(backup.lockFile.backupPath)) {
    fs.unlinkSync(backup.lockFile.backupPath)
  }
}

function getLockFilePath(projectRoot: string, pm: PackageManager): string | null {
  const lockFiles: Record<PackageManager, string> = {
    npm: 'package-lock.json',
    pnpm: 'pnpm-lock.yaml',
    yarn: 'yarn.lock',
  }

  const lockFile = lockFiles[pm]
  return lockFile ? join(projectRoot, lockFile) : null
}
```

### Pattern 2: Error Context Enrichment for Coder Feedback

**What:** Convert install errors into actionable feedback for coder retry

**When to use:** When installPackages fails, before triggering coder retry

**Example:**
```typescript
// Convert install error to coder feedback
function formatInstallFailureFeedback(
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
      lines.push('Possible causes:')
      lines.push('- Package name typo or version conflict')
      lines.push('- Network connectivity issues')
      lines.push('- Peer dependency conflicts')
      lines.push('')
      lines.push('Action: Rewrite code without these packages or use built-in alternatives.')
      break

    case 'execution_failed':
      lines.push(`Failed to execute package manager: ${error.message}`)
      lines.push('Project state has been rolled back.')
      lines.push('Action: Rewrite code without external packages.')
      break

    case 'invalid_argument':
      lines.push(`Invalid package name: ${error.message}`)
      lines.push('Action: Fix package name or remove dependency.')
      break
  }

  return lines.join('\n')
}

// In pipeline import validation loop (after install failure)
if (!prodResult.ok) {
  const feedback = formatInstallFailureFeedback(
    categorized.production,
    prodResult.error,
    detectedPM
  )

  pipelineLogger.warn({ error: prodResult.error.message }, 'Production install failed, rollback complete')

  // Trigger coder retry with failure context
  codeResult = await coderAgent(
    { ...coderInput, importValidationFeedback: feedback },
    createAgentContext('coder')
  )
}
```

### Pattern 3: Idempotent Backup/Restore (Handle Partial State)

**What:** Ensure backup/restore operations are safe even if partially complete

**When to use:** In all backup/restore operations to handle edge cases

**Example:**
```typescript
// Safe restore that handles missing backups gracefully
function safeRestore(backup: BackupState, logger: Logger): void {
  try {
    // Restore package.json
    if (fs.existsSync(backup.packageJson.backupPath)) {
      if (fs.existsSync(backup.packageJson.path)) {
        // Remove potentially corrupted current file
        fs.unlinkSync(backup.packageJson.path)
      }
      fs.renameSync(backup.packageJson.backupPath, backup.packageJson.path)
      logger.info({ file: 'package.json' }, 'Restored from backup')
    } else {
      logger.warn({ file: 'package.json' }, 'Backup not found, cannot restore')
    }

    // Restore lock file
    if (backup.lockFile) {
      if (fs.existsSync(backup.lockFile.backupPath)) {
        if (fs.existsSync(backup.lockFile.path)) {
          fs.unlinkSync(backup.lockFile.path)
        }
        fs.renameSync(backup.lockFile.backupPath, backup.lockFile.path)
        logger.info({ file: backup.lockFile.path }, 'Restored lock file from backup')
      }
    }
  } catch (error) {
    logger.error({ error }, 'Error during backup restoration')
    throw error  // Re-throw to signal restoration failure
  }
}

// Safe cleanup that doesn't fail if backups already removed
function safeCleanup(backup: BackupState, logger: Logger): void {
  try {
    if (fs.existsSync(backup.packageJson.backupPath)) {
      fs.unlinkSync(backup.packageJson.backupPath)
    }

    if (backup.lockFile && fs.existsSync(backup.lockFile.backupPath)) {
      fs.unlinkSync(backup.lockFile.backupPath)
    }

    logger.debug({}, 'Backup files cleaned up')
  } catch (error) {
    // Non-critical error - log but don't fail
    logger.warn({ error }, 'Failed to cleanup backup files (non-critical)')
  }
}
```

### Pattern 4: Timeout Detection (Future Enhancement)

**What:** Detect hung installations and abort with timeout

**When to use:** For installations that exceed reasonable time limits

**Example:**
```typescript
// Note: Not required for v1, but included for future reference
import { spawn } from 'node:child_process'

function installWithTimeout(
  pm: PackageManager,
  args: string[],
  projectRoot: string,
  timeoutMs: number = 300000  // 5 minutes default
): Promise<Result<InstallResult, InstallError>> {
  return new Promise((resolve) => {
    const child = spawn(pm, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: false,
    })

    // Timeout timer
    const timer = setTimeout(() => {
      child.kill('SIGTERM')  // Try graceful termination first

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
        }
      }, 5000)

      resolve(err({
        type: 'install_failed',
        message: `Installation timed out after ${timeoutMs}ms`,
        exitCode: 124,  // Standard timeout exit code
      }))
    }, timeoutMs)

    child.on('error', (error) => {
      clearTimeout(timer)
      resolve(err({
        type: 'execution_failed',
        message: `Failed to execute ${pm}: ${error.message}`,
      }))
    })

    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve(ok({ success: true, packages: [], packageManager: pm }))
      } else {
        resolve(err({
          type: 'install_failed',
          message: `Package installation failed with exit code ${code}`,
          exitCode: code ?? 1,
        }))
      }
    })
  })
}
```

### Anti-Patterns to Avoid

- **Async backup/restore operations:** Use synchronous fs operations (copyFileSync, renameSync) to ensure backup completes before installation starts
- **Skipping lock file backup:** Lock file corruption is harder to debug than package.json issues. Always backup both.
- **Backup to temp directory:** Cross-filesystem rename is not atomic. Keep backups in same directory as originals.
- **Ignoring restore failures:** If restore fails, project is in inconsistent state. Log loudly and halt pipeline.
- **Removing backups on failure:** Keep backup files after rollback for debugging. Let cleanup happen on next successful install.
- **Continuing after install failure:** If installation fails, don't proceed to review. Retry coder or abort task.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file writes | Custom transaction system | fs.copyFileSync + fs.renameSync pattern | Rename is atomic on Unix, sufficient for backup/restore |
| Process timeout handling | Custom timeout implementation | child_process spawn with setTimeout and kill() | Standard Node.js pattern, well-tested |
| Package manager detection | Parsing lock file formats | Existing detectPackageManager() (already implemented) | Already handles npm/pnpm/yarn detection correctly |
| Error context formatting | Generic error messages | Structured InstallError types with specific messages | Existing error types provide actionable context |

**Key insight:** Phase 4 is about wrapping existing primitives (installPackages, fs operations) with backup/restore logic. The hard work (spawn management, exit code detection, Result pattern) is already done in Phase 1.

## Common Pitfalls

### Pitfall 1: Race Conditions Between Backup and Install

**What goes wrong:** Backup created, but installation starts before backup completes (async operations)

**Why it happens:** Using fs.copyFile() (async) instead of fs.copyFileSync() (sync)

**How to avoid:** Always use synchronous fs operations for backup/restore to ensure sequential execution

**Warning signs:** Backup files empty or partially written, corrupt lock files after rollback

### Pitfall 2: Lock File Mismatch After Restore

**What goes wrong:** package.json restored but lock file not restored (or vice versa), causing inconsistency

**Why it happens:** Restoring only one file, or restore order is wrong

**How to avoid:** Always restore both files atomically, verify both exist before marking rollback complete

**Warning signs:** npm/pnpm warns about lock file out of sync after rollback, installation succeeds on retry but with different resolved versions

### Pitfall 3: Missing Network Error Detection

**What goes wrong:** Network timeouts return exit code 1 (generic failure), same as package not found

**Why it happens:** Package managers don't consistently use unique exit codes for different failure types

**How to avoid:** Accept that exit code alone is insufficient. Log full stderr output for debugging. In feedback, list all possible causes (network, typo, peer deps).

**Warning signs:** Users report "package not found" errors during network outages

### Pitfall 4: Backup Files Left Behind After Success

**What goes wrong:** .backup files accumulate in project root, cluttering workspace

**Why it happens:** cleanupBackups() not called after successful installation, or cleanup fails silently

**How to avoid:** Always cleanup backups after success. Log cleanup failures as warnings (non-critical).

**Warning signs:** Users find multiple .backup files in git status, confusion about which is current

### Pitfall 5: Partial Installation State (Prod Succeeds, Dev Fails)

**What goes wrong:** Production packages installed successfully, dev installation fails. Rollback restores package.json, losing prod packages.

**Why it happens:** Creating single backup before sequential prod + dev installations

**How to avoid:** Create backup before prod install. On success, create new backup before dev install. Each install has its own rollback boundary.

**Warning signs:** Successful production install lost after dev install failure

### Pitfall 6: Insufficient Coder Feedback After Failure

**What goes wrong:** Coder gets "installation failed" message but doesn't know which packages or why

**Why it happens:** Generic error message without context about failed packages or error type

**How to avoid:** Include package names, error type, exit code, and suggested actions in feedback

**Warning signs:** Coder retry generates same code with same packages, infinite loop

### Pitfall 7: Multiple Lock Files During Rollback

**What goes wrong:** detectPackageManager returns error due to multiple lock files after partial rollback

**Why it happens:** Backup restoration creates duplicate lock file (backup and current both exist)

**How to avoid:** Delete current file before renaming backup. Use fs.renameSync which is atomic (replaces destination).

**Warning signs:** "Multiple lock files detected" error after rollback

### Pitfall 8: Cross-Filesystem Backup Issues

**What goes wrong:** fs.renameSync() fails across different filesystems (e.g., /tmp on different mount)

**Why it happens:** Backup directory on different filesystem than project root

**How to avoid:** Always create backups in same directory as originals (use .backup suffix, not temp directory)

**Warning signs:** EXDEV (cross-device link) errors during restore

## Code Examples

Verified patterns from research and existing codebase:

### Current Install Flow (from pipeline.ts lines 282-315)

```typescript
// Source: src/orchestrator/pipeline.ts
// Current installation WITHOUT rollback (Phase 3 state)

// Install production packages first
if (categorized.production.length > 0) {
  const prodResult = await installPackages({
    packageManager: detectedPM,
    packages: categorized.production,
    projectRoot: tools.getProjectRoot(),
    category: 'prod',
  })
  if (prodResult.ok) {
    allInstalled.push(...categorized.production)
    installedProd.push(...categorized.production)
  } else {
    pipelineLogger.warn({ error: prodResult.error.message }, 'Production install failed')
    registryInvalid.push(...categorized.production)
    installFailed = true
  }
}

// Install dev packages
if (categorized.dev.length > 0) {
  const devResult = await installPackages({
    packageManager: detectedPM,
    packages: categorized.dev,
    projectRoot: tools.getProjectRoot(),
    category: 'dev',
  })
  if (devResult.ok) {
    allInstalled.push(...categorized.dev)
    installedDev.push(...categorized.dev)
  } else {
    pipelineLogger.warn({ error: devResult.error.message }, 'Dev install failed')
    registryInvalid.push(...categorized.dev)
    installFailed = true
  }
}
```

### Enhanced Install Flow WITH Rollback (Phase 4)

```typescript
// Enhanced version with backup/restore
import { join } from 'node:path'
import { copyFileSync, renameSync, unlinkSync, existsSync } from 'node:fs'

type BackupState = {
  packageJson: { path: string; backupPath: string }
  lockFile: { path: string; backupPath: string } | null
}

function createBackup(projectRoot: string, pm: PackageManager): BackupState {
  const pkgPath = join(projectRoot, 'package.json')
  const pkgBackup = `${pkgPath}.backup-${Date.now()}`
  copyFileSync(pkgPath, pkgBackup)

  const lockFiles: Record<PackageManager, string> = {
    npm: 'package-lock.json',
    pnpm: 'pnpm-lock.yaml',
    yarn: 'yarn.lock',
  }

  const lockFileName = lockFiles[pm]
  const lockPath = join(projectRoot, lockFileName)
  let lockBackup: { path: string; backupPath: string } | null = null

  if (existsSync(lockPath)) {
    const backupPath = `${lockPath}.backup-${Date.now()}`
    copyFileSync(lockPath, backupPath)
    lockBackup = { path: lockPath, backupPath }
  }

  return {
    packageJson: { path: pkgPath, backupPath: pkgBackup },
    lockFile: lockBackup,
  }
}

function restoreBackup(backup: BackupState, logger: Logger): void {
  // Restore package.json
  if (existsSync(backup.packageJson.backupPath)) {
    renameSync(backup.packageJson.backupPath, backup.packageJson.path)
    logger.info({ file: 'package.json' }, 'Rolled back to backup')
  }

  // Restore lock file
  if (backup.lockFile && existsSync(backup.lockFile.backupPath)) {
    renameSync(backup.lockFile.backupPath, backup.lockFile.path)
    logger.info({ file: backup.lockFile.path }, 'Rolled back lock file')
  }
}

function cleanupBackup(backup: BackupState): void {
  if (existsSync(backup.packageJson.backupPath)) {
    unlinkSync(backup.packageJson.backupPath)
  }
  if (backup.lockFile && existsSync(backup.lockFile.backupPath)) {
    unlinkSync(backup.lockFile.backupPath)
  }
}

// In pipeline (enhanced installation)
const allInstalled: string[] = []
let installFailed = false

// Install production packages with rollback
if (categorized.production.length > 0) {
  const prodBackup = createBackup(tools.getProjectRoot(), detectedPM)

  const prodResult = await installPackages({
    packageManager: detectedPM,
    packages: categorized.production,
    projectRoot: tools.getProjectRoot(),
    category: 'prod',
  })

  if (prodResult.ok) {
    allInstalled.push(...categorized.production)
    installedProd.push(...categorized.production)
    cleanupBackup(prodBackup)
    pipelineLogger.info({ packages: categorized.production }, 'Production packages installed')
  } else {
    restoreBackup(prodBackup, pipelineLogger)
    pipelineLogger.warn(
      { error: prodResult.error.message, exitCode: prodResult.error.exitCode },
      'Production install failed, rolled back project state'
    )
    registryInvalid.push(...categorized.production)
    installFailed = true
  }
}

// Install dev packages with rollback
if (categorized.dev.length > 0 && !installFailed) {
  const devBackup = createBackup(tools.getProjectRoot(), detectedPM)

  const devResult = await installPackages({
    packageManager: detectedPM,
    packages: categorized.dev,
    projectRoot: tools.getProjectRoot(),
    category: 'dev',
  })

  if (devResult.ok) {
    allInstalled.push(...categorized.dev)
    installedDev.push(...categorized.dev)
    cleanupBackup(devBackup)
    pipelineLogger.info({ packages: categorized.dev }, 'Dev packages installed')
  } else {
    restoreBackup(devBackup, pipelineLogger)
    pipelineLogger.warn(
      { error: devResult.error.message, exitCode: devResult.error.exitCode },
      'Dev install failed, rolled back project state'
    )
    registryInvalid.push(...categorized.dev)
    installFailed = true
  }
}
```

### Node.js Synchronous File Operations (Official)

```typescript
// Source: https://nodejs.org/api/fs.html
import { copyFileSync, renameSync, unlinkSync, existsSync } from 'node:fs'

// Synchronous copy (blocks until complete)
copyFileSync('source.txt', 'destination.txt')

// Atomic rename (replaces destination if exists, Unix only)
renameSync('temp.txt', 'final.txt')

// Delete file
unlinkSync('file.txt')

// Check existence
if (existsSync('file.txt')) {
  // File exists
}
```

### Current InstallError Types (from packageInstaller.ts)

```typescript
// Source: src/tools/packageInstaller.ts lines 11-15
export type InstallError = {
  type: 'install_failed' | 'execution_failed' | 'invalid_argument'
  message: string
  exitCode?: number
}

// install_failed: Package manager ran but returned non-zero exit code
// execution_failed: Failed to spawn package manager process
// invalid_argument: Package name contains shell metacharacters
```

### Coder Feedback Format (Enhanced for Phase 4)

```typescript
// Build actionable feedback from install failure
function formatInstallError(
  packages: string[],
  error: InstallError,
  pm: PackageManager
): string {
  const lines = [
    `❌ Package installation failed and project state was rolled back.`,
    '',
    `Packages attempted: ${packages.join(', ')}`,
    `Package manager: ${pm}`,
    `Error type: ${error.type}`,
  ]

  if (error.exitCode) {
    lines.push(`Exit code: ${error.exitCode}`)
  }

  lines.push('')
  lines.push(`Reason: ${error.message}`)
  lines.push('')
  lines.push('Possible causes:')

  if (error.type === 'install_failed') {
    lines.push('- Package name typo or does not exist on registry')
    lines.push('- Version conflict with existing dependencies')
    lines.push('- Peer dependency requirements not met')
    lines.push('- Network connectivity issues or registry timeout')
  } else if (error.type === 'execution_failed') {
    lines.push('- Package manager not installed or not in PATH')
    lines.push('- Permission issues executing package manager')
  }

  lines.push('')
  lines.push('Required action: Rewrite code without these packages or use built-in Node.js alternatives.')

  return lines.join('\n')
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No rollback, corrupted on failure | Backup/restore pattern | Best practice since npm 5.0 (2017) | Project integrity preserved on failure |
| Manual package.json editing | Package manager install commands | Always standard | Automatic lock file updates |
| Async fs.copyFile | Synchronous fs.copyFileSync for backups | Node 10+ preference for critical ops | Guaranteed sequential execution |
| Generic exit code handling | Structured InstallError types | Modern error handling (2024+) | Better error context for debugging |
| Continue pipeline on install failure | Halt and rollback | Emerging best practice (2025-2026) | Prevents cascading failures |
| Temp directory backups | Same-directory backups | Unix atomicity requirement | fs.renameSync is atomic only on same filesystem |

**Deprecated/outdated:**
- **package-lock.json manual editing:** Always breaks sync between package.json and lock. Let package manager regenerate.
- **Optimistic installation (no failure handling):** Modern agents must handle failure gracefully and provide recovery.
- **Cross-filesystem backups:** EXDEV errors on rename. Keep backups adjacent to originals.

## Open Questions

1. **Should rollback preserve partial success (prod installed, dev failed)?**
   - What we know: Current implementation creates single backup before both installs
   - What's unclear: Should prod packages remain if only dev install fails?
   - Recommendation: Each install category (prod/dev) gets its own backup. Prod success preserved if dev fails (as designed in prior phases).

2. **Should timeout be implemented in v1?**
   - What we know: spawn() supports timeout with killSignal, but current code doesn't use it
   - What's unclear: What timeout value is reasonable? (npm install can take minutes on slow networks)
   - Recommendation: OUT OF SCOPE for v1. SAFE-02 only requires rollback on failure, not timeout detection. Consider for v2.

3. **Should backup files be timestamped or simple .backup suffix?**
   - What we know: Timestamp prevents collision, .backup is cleaner for debugging
   - What's unclear: Is collision risk real (sequential installs, cleanup happens)?
   - Recommendation: Use timestamp suffix (.backup-{Date.now()}) to prevent collisions if cleanup fails. Small timestamp overhead is acceptable.

4. **Should stderr be captured and included in coder feedback?**
   - What we know: Current installPackages uses stdio: 'inherit' (no capture)
   - What's unclear: Would stderr provide actionable information for coder?
   - Recommendation: OUT OF SCOPE for v1. stdio: 'inherit' provides real-time output to user. Capturing stderr requires 'pipe' mode, losing real-time visibility.

5. **How should rollback communicate to ImportValidator rebuild?**
   - What we know: Successful install triggers ImportValidator rebuild (lines 321-324 in pipeline.ts)
   - What's unclear: After rollback, should ImportValidator rebuild with pre-install state?
   - Recommendation: After rollback, ImportValidator state is unchanged (packages weren't actually added). No rebuild needed.

## Sources

### Primary (HIGH confidence)
- **Node.js official documentation** - https://nodejs.org/api/fs.html (fs.copyFileSync, fs.renameSync, atomicity guarantees)
- **Node.js official documentation** - https://nodejs.org/api/child_process.html (spawn timeout, killSignal)
- **Existing codebase:**
  - src/tools/packageInstaller.ts - installPackages() with Result<InstallResult, InstallError>
  - src/tools/packageManager.ts - detectPackageManager() and lock file paths
  - src/orchestrator/pipeline.ts - Sequential prod/dev install (lines 282-315)
  - src/utils/result.ts - Result<T, E> pattern for error handling
- **npm documentation** - https://docs.npmjs.com/cli/v8/configuring-npm/package-lock-json/ (lock file purpose and sync requirements)

### Secondary (MEDIUM confidence)
- [Patch Management in 2026: Benefits, Best Practices & Tools](https://tuxcare.com/blog/patch-management/) - Rollback planning and testing best practices
- [DevOps Best Practices: The Complete Implementation Guide (2026)](https://zenocloud.io/blog/devops-best-practices/) - Rollback and recovery patterns
- [Node.js File System in Practice: A Production-Grade Guide for 2026](https://thelinuxcode.com/nodejs-file-system-in-practice-a-production-grade-guide-for-2026/) - Atomic file operations and backup patterns
- [How to Use Helm for Kubernetes Package Management](https://oneuptime.com/blog/post/2026-01-25-helm-kubernetes-package-management/view) - Rollback patterns in package management
- [How to Understand package-lock.json in Node.js](https://oneuptime.com/blog/post/2026-01-22-nodejs-package-lock-json/view) - Lock file sync importance
- [Node.js - child process timeouts](https://mattsumme.rs/2015/nodejs-child-process-timeouts/) - Timeout handling patterns

### Tertiary (LOW confidence - marked for validation)
- [pnpm install fails when npm install succeeds](https://github.com/pnpm/pnpm/issues/6434) - Package manager specific failure modes (varies by PM version)
- [npm ERR! code ELIFECYCLE](https://geeksforgeeks.org/node-js/how-to-solve-npm-error-npm-err-code-elifecycle/) - Exit code meanings (community interpretation, not official spec)
- [How to Fix npm ERR! code ELIFECYCLE Errors](https://oneuptime.com/blog/post/2026-01-22-nodejs-npm-elifecycle-errors/view) - Community troubleshooting (exit codes vary by npm version)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All features implementable with Node.js built-ins (fs, child_process), no new dependencies
- Architecture patterns: HIGH - Backup/restore pattern is industry standard, verified in multiple sources
- Atomicity guarantees: MEDIUM - fs.renameSync is atomic on Unix but not guaranteed on Windows (acceptable for v1)
- Error detection: HIGH - Existing InstallError types and exit code handling already robust
- Coder feedback: HIGH - Pattern already exists for import validation feedback, extend for install failures

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (30 days - stable domain, file system APIs don't change)

**Node.js version context:**
- Project minimum: Node.js 20.0.0 (from package.json engines)
- All fs operations (copyFileSync, renameSync) available since Node 0.x
- spawn timeout option available since Node 15.13.0
- Impact: All patterns are stable and available in target Node version

**Prior phase dependencies:**
- Phase 1: packageInstaller.ts with Result pattern (already implemented)
- Phase 2: Sequential prod/dev installation with tracking (already implemented)
- Phase 3: Coder feedback mechanism via importValidationFeedback (already implemented)
- Phase 4 builds directly on these foundations without modification to existing code
