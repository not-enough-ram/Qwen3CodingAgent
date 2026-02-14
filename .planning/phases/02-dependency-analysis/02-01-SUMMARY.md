---
phase: 02-dependency-analysis
plan: 01
subsystem: tools
tags: [tdd, categorization, dev-dependencies, test-detection]
dependency_graph:
  requires: []
  provides: [src/tools/dependencyCategorizer.ts]
  affects: [src/tools/packageInstaller.ts, src/tools/index.ts]
---

## What was built

Dependency categorization module that classifies packages as production or dev based on importing file paths, @types/* detection, and known dev-only package list. Also updated buildInstallArgs to support --save-dev/-D/--dev flags.

## Key files

### Created
- `src/tools/dependencyCategorizer.ts` — isTestFile(), categorizePackage(), categorizePackages()
- `test/tools/dependencyCategorizer.test.ts` — 15 tests covering all categorization paths

### Modified
- `src/tools/packageInstaller.ts` — buildInstallArgs now accepts category parameter
- `test/tools/packageInstaller.test.ts` — 6 new tests for dev install args
- `src/tools/index.ts` — barrel export added

## Commits

- `8592752` feat(02-01): implement dependency categorizer with TDD
- `d760343` feat(02-01): add dev dependency support to buildInstallArgs

## Self-Check: PASSED
