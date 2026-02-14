---
phase: 01-ecosystem-detection
plan: 03
subsystem: tools, orchestrator, cli
tags: [installer, pipeline-integration, auto-install, consent]
dependency_graph:
  requires: [src/tools/packageManager.ts, src/tools/packageRegistry.ts, src/utils/result.ts, src/consent/manager.ts]
  provides: [src/tools/packageInstaller.ts]
  affects: [src/orchestrator/pipeline.ts, src/cli/index.ts, src/cli/commands/run.ts, src/utils/config.ts, src/tools/toolkit.ts]
tech_stack:
  added:
    - "Node.js child_process.spawn (shell:false, stdio:inherit)"
  patterns:
    - "Registry validation before consent"
    - "Batch installation with real-time output"
    - "Import re-validation after install"
---

## What was built

Package installer that executes PM commands via `spawn()` with shell injection protection and real-time output streaming. Integrated into the pipeline's import validation loop to detect missing packages, validate against npm registry, get user consent, install, and re-verify imports resolve.

## Key files

### Created
- `src/tools/packageInstaller.ts` — `installPackages()` and `buildInstallArgs()` with shell metacharacter validation
- `test/tools/packageInstaller.test.ts` — 8 unit tests covering arg building and shell injection protection

### Modified
- `src/orchestrator/pipeline.ts` — Enhanced import validation loop with detect→validate→consent→install→re-verify flow
- `src/cli/index.ts` — Added `--auto-install` flag to run command
- `src/cli/commands/run.ts` — Pass `autoInstall` through to PipelineOptions
- `src/utils/config.ts` — Added `autoInstall` to PipelineConfigSchema
- `src/tools/toolkit.ts` — Added `yarn` to ALLOWED_COMMANDS
- `src/tools/index.ts` — Added packageInstaller export

## Decisions made

1. **Detect PM once per pipeline run** — stored in variable, avoids redundant filesystem checks
2. **Registry validation before consent** — prevents hallucinated package names from reaching user prompts
3. **Rebuild ImportValidator after install** — creates new instance with updated dependency list rather than mutating
4. **Fall back to coder rewrite** — when no PM detected (multiple lock files) or installation fails, original behavior preserved
5. **Shell metacharacter validation** — defense in depth using same SHELL_META regex as toolkit.ts

## Commits

- `4d16c31` feat(01-03): add package installer, --auto-install flag, and pipeline wiring
- `7310fe5` feat(01-03): integrate dependency installation into pipeline

## Verification

- TypeScript compiles without errors
- 8 new packageInstaller tests pass
- 109 total unit tests pass (no regressions)
- --auto-install flag appears in CLI help output

## Self-Check: PASSED

All must_haves verified:
- [x] Agent detects package manager and uses it for installation commands
- [x] Packages validated against npm registry before consent prompt
- [x] User sees install command preview in consent prompt
- [x] Approved packages installed via single batched command
- [x] Installation output streams to console in real-time (stdio: inherit)
- [x] Failed installations feed error back to coder
- [x] Rejected packages feed back to coder
- [x] --auto-install flag skips consent prompts
- [x] After successful install, import validation re-runs to verify imports resolve
