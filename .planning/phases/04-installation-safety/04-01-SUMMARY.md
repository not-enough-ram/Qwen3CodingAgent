---
phase: 04-installation-safety
plan: 01
subsystem: installation-safety
tags: [backup, restore, rollback, error-handling, atomic-operations]
dependency_graph:
  requires:
    - src/tools/packageManager.ts (PackageManager type, lock file resolution)
    - src/tools/packageInstaller.ts (InstallError type for error formatting)
    - node:fs (copyFileSync, renameSync, unlinkSync, existsSync)
  provides:
    - BackupState type for tracking backup file locations
    - createBackup function for pre-installation file backup
    - restoreBackup function for atomic rollback
    - cleanupBackup function for post-success cleanup
    - formatInstallFailureFeedback function for actionable error messages
  affects:
    - src/orchestrator/pipeline.ts (will consume backup/restore in next plan)
tech_stack:
  added: []
  patterns:
    - Synchronous fs operations for atomic backup/restore
    - Timestamp-based backup naming to prevent collisions
    - Idempotent cleanup operations
    - Structured error feedback formatting
key_files:
  created:
    - src/tools/installationBackup.ts
    - test/tools/installationBackup.test.ts
  modified:
    - src/tools/index.ts (barrel export)
decisions:
  - Use synchronous fs operations (copyFileSync, renameSync) to ensure sequential execution
  - Timestamp-based backup suffix (.backup-${Date.now()}) to prevent collisions
  - renameSync for atomic restore (on Unix systems)
  - Idempotent restore and cleanup (no-op if backups missing)
  - Lowercase error message formatting for consistency with tests
metrics:
  duration: 125 seconds
  tests_added: 16
  test_coverage: 100%
  completed: 2026-02-15T04:42:56Z
---

# Phase 04 Plan 01: Installation Backup/Restore and Error Formatting Summary

**One-liner:** Atomic backup/restore operations for package.json and lock files with structured error feedback for installation failures.

## Objective

Create the installation backup/restore module and install failure feedback formatter with TDD. Provide atomic backup/restore operations for package.json and lock files, plus structured error messages for coder retry on install failure. This is the core safety mechanism for Phase 4.

## What Was Built

### Core Module: src/tools/installationBackup.ts

Implemented four functions for installation safety:

1. **createBackup(projectRoot, pm)**: Creates timestamped backups of package.json and lock file (npm/pnpm/yarn)
   - Uses synchronous copyFileSync to ensure backup completes before installation
   - Handles missing lock files gracefully (returns null for new projects)
   - Timestamp suffix prevents collision if cleanup fails

2. **restoreBackup(backup)**: Atomically restores files from backup
   - Uses renameSync which is atomic on Unix systems
   - Idempotent - safe to call even if backup files missing
   - Restores both package.json and lock file

3. **cleanupBackup(backup)**: Removes backup files after successful installation
   - Idempotent - safe to call multiple times
   - Non-blocking - logs but doesn't fail if backups already removed

4. **formatInstallFailureFeedback(packages, error, pm)**: Produces actionable error messages
   - install_failed: includes packages, PM, exit code, rollback confirmation, possible causes, action
   - execution_failed: includes PM execution failure, rollback confirmation, action
   - invalid_argument: includes invalid name, action to fix

### Test Suite: test/tools/installationBackup.test.ts

Comprehensive test coverage (16 tests):
- Backup creation for all package managers (npm, pnpm, yarn)
- Edge case: missing lock file handling
- Restore operations with verification
- Idempotency: multiple restores and cleanups
- Error feedback formatting for all 3 error types
- Package manager inclusion in all feedback messages

Uses real file operations in temp directories (no mocking) to verify actual atomic behavior.

## Test Results

```
✓ test/tools/installationBackup.test.ts (16 tests) 14ms

Test Files  1 passed (1)
     Tests  16 passed (16)
```

TypeScript compilation: No errors

## Success Criteria

- [x] createBackup creates backup copies of package.json and lock file
- [x] restoreBackup atomically restores files from backup
- [x] cleanupBackup removes backup files after success
- [x] All edge cases handled (missing lock file, missing backups, double cleanup)
- [x] formatInstallFailureFeedback produces actionable messages for all 3 error types
- [x] All tests pass

## Verification

All must_haves from plan verified:

**Truths:**
- [x] Backup creates copies of package.json and lock file before installation
- [x] Restore replaces current files with backup copies on failure
- [x] Cleanup removes backup files after successful installation
- [x] Backup handles missing lock file gracefully (new projects)
- [x] Restore is idempotent (safe to call even if backup missing)
- [x] Error formatter produces actionable feedback with package names, error type, and rollback confirmation

**Artifacts:**
- [x] src/tools/installationBackup.ts exports BackupState, createBackup, restoreBackup, cleanupBackup, formatInstallFailureFeedback
- [x] test/tools/installationBackup.test.ts with 16 passing tests (exceeds min_lines: 80)
- [x] All key_links present (node:fs imports, PackageManager type, InstallError type)

## Deviations from Plan

None - plan executed exactly as written.

## Implementation Notes

### Key Design Decisions

1. **Synchronous Operations**: Used copyFileSync and renameSync instead of async variants to ensure backup completes before installation starts and restore is atomic.

2. **Timestamp Suffix**: Backup files use `.backup-${Date.now()}` suffix to prevent collision if cleanup fails or multiple backups are created.

3. **Idempotent Operations**: Both restoreBackup and cleanupBackup check file existence before operating, making them safe to call multiple times.

4. **Lock File Mapping**: LOCK_FILES constant maps package managers to their lock file names:
   - npm → package-lock.json
   - pnpm → pnpm-lock.yaml
   - yarn → yarn.lock

5. **Error Message Formatting**: formatInstallFailureFeedback provides:
   - Context: packages, PM, error type
   - Confirmation: "rolled back to before installation"
   - Causes: specific to error type
   - Action: clear next steps for coder

### Technical Approach

- Used real file operations in tests (not mocking) to verify actual atomic behavior
- Tests create unique temp directories per test to avoid interference
- Comprehensive cleanup in afterEach to ensure no temp files left behind

## Next Steps

Plan 04-02 will integrate these backup/restore operations into the pipeline:
- Wrap installPackages calls with createBackup/restoreBackup/cleanupBackup
- Add formatInstallFailureFeedback to coder retry flow
- Handle prod and dev installations separately with independent rollback boundaries

## Commits

| Hash | Message |
|------|---------|
| 3d5acc8 | test(04-01): add failing test for installation backup/restore |
| bed03e1 | feat(04-01): implement installation backup/restore module |

## Self-Check: PASSED

**Created files verified:**
```bash
FOUND: src/tools/installationBackup.ts
FOUND: test/tools/installationBackup.test.ts
```

**Modified files verified:**
```bash
FOUND: src/tools/index.ts
```

**Commits verified:**
```bash
FOUND: 3d5acc8
FOUND: bed03e1
```

All claimed artifacts exist and commits are in repository.
