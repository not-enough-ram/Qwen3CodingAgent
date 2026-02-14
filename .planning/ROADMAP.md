# Roadmap: QwenCodingAgent

## Overview

This roadmap delivers automatic dependency management capabilities to QwenCodingAgent, transforming it from a code generator that avoids missing packages to one that installs them. The journey progresses from foundational package manager detection and installation (Phase 1), through intelligent dependency analysis and safety validation (Phase 2), to user-facing features like built-in alternatives (Phase 3), and finally to robust error handling with rollback capabilities (Phase 4).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Ecosystem Detection & Package Manager Support** - Auto-detect Node.js package managers and execute approved installations
- [x] **Phase 2: Dependency Analysis & Safety** - Identify missing imports, validate packages, and integrate consent flow
- [ ] **Phase 3: User Experience & Intelligent Alternatives** - Offer built-in alternatives and explain dependency needs
- [ ] **Phase 4: Installation Safety & Recovery** - Handle installation failures with rollback capabilities

## Phase Details

### Phase 1: Ecosystem Detection & Package Manager Support
**Goal**: Agent auto-detects Node.js package managers (npm/pnpm/yarn) and executes approved package installations
**Depends on**: Nothing (first phase)
**Requirements**: DEP-01, INST-01, INST-02
**Success Criteria** (what must be TRUE):
  1. Agent correctly detects package manager from lockfiles (pnpm-lock.yaml, package-lock.json, yarn.lock)
  2. Agent executes package installation using detected package manager after user approval
  3. Package manager automatically updates manifest files (package.json) and lock files
  4. Installation commands integrate with existing ToolKit command execution infrastructure
**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — Package manager detection from lock files (TDD)
- [x] 01-02-PLAN.md — npm registry validation client
- [x] 01-03-PLAN.md — Package installer + pipeline integration + --auto-install flag

### Phase 2: Dependency Analysis & Safety
**Goal**: Agent identifies missing imports in generated code, validates packages against registries, and integrates with existing consent manager
**Depends on**: Phase 1
**Requirements**: DEP-02, DEP-03, SAFE-01, SAFE-03
**Success Criteria** (what must be TRUE):
  1. Agent detects missing imports in coder-generated code and maps them to installable package names
  2. Agent validates package names against npm registry before installation
  3. Agent categorizes dependencies as production or dev based on usage context (test files → devDependencies)
  4. All installation requests flow through existing ConsentManager with proper metadata
  5. Import validation loop in pipeline integrates dependency installation before review phase
**Plans:** 3 plans

Plans:
- [x] 02-01-PLAN.md — Dependency categorizer (TDD) + buildInstallArgs dev support
- [x] 02-02-PLAN.md — Pipeline integration for categorized installation
- [x] 02-03-PLAN.md — Gap closure: pipeline categorization integration tests

### Phase 3: User Experience & Intelligent Alternatives
**Goal**: Agent offers built-in Node.js alternatives and explains why packages are needed
**Depends on**: Phase 2
**Requirements**: INST-03, INST-04
**Success Criteria** (what must be TRUE):
  1. Agent detects when built-in Node.js module can replace external package (e.g., node:crypto instead of uuid)
  2. User receives choice prompt showing both built-in alternative and installable package option
  3. Agent explains package purpose with file and line context (e.g., "Installing 'zod' for schema validation in user.ts:15")
  4. Enhanced SUBSTITUTION_MAP provides comprehensive built-in alternatives coverage
**Plans:** 2 plans

Plans:
- [ ] 03-01-PLAN.md — Structured SUBSTITUTION_MAP + enhanced ConsentPrompter with alternatives and file context
- [ ] 03-02-PLAN.md — Pipeline integration for alternative selection flow and coder retry

### Phase 4: Installation Safety & Recovery
**Goal**: Agent safely handles installation failures and rolls back project state on failure
**Depends on**: Phase 3
**Requirements**: SAFE-02
**Success Criteria** (what must be TRUE):
  1. Agent detects installation failures (non-zero exit codes, timeout, network errors)
  2. Failed installations trigger rollback to previous package.json and lock file state
  3. Rollback preserves project integrity (no partial installations or corrupted lock files)
  4. User receives clear error messages explaining failure reason and rollback actions taken
  5. Subsequent coder attempts receive feedback about failed package installation
**Plans**: TBD

Plans:
- [ ] TBD during phase planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Ecosystem Detection & Package Manager Support | 3/3 | ✓ Complete | 2026-02-14 |
| 2. Dependency Analysis & Safety | 3/3 | ✓ Complete | 2026-02-14 |
| 3. User Experience & Intelligent Alternatives | 0/2 | Not started | - |
| 4. Installation Safety & Recovery | 0/TBD | Not started | - |
