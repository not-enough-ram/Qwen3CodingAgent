# QwenCodingAgent

## What This Is

A multi-agent coding assistant powered by the open-source Qwen model. It takes a user's coding request and runs it through a pipeline of specialized agents (planner, architect, coder, reviewer) to produce working code changes with automatic dependency management. Built in TypeScript, runs as a CLI tool.

## Core Value

The agent produces code that actually runs — including having the right dependencies installed.

## Requirements

### Validated

- ✓ Multi-agent pipeline (planner → architect → coder → reviewer) — existing
- ✓ CLI interface with run, plan, and doctor commands — existing
- ✓ Structured LLM output with Zod schema validation — existing
- ✓ Import validation loop that detects undeclared imports — existing
- ✓ Code review feedback loop with retry — existing
- ✓ User consent management for package installations — existing
- ✓ Project context gathering (package.json, directory tree, README) — existing
- ✓ File change staging with diff preview — existing
- ✓ OpenAI-compatible API client (works with local Qwen via Ollama) — existing
- ✓ Configuration via file and environment variables — existing
- ✓ Auto-detect and install missing Node.js dependencies — v1.0
- ✓ Package manager detection (npm/pnpm/yarn) from lockfiles — v1.0
- ✓ Dependency categorization (prod vs dev) based on usage — v1.0
- ✓ Built-in alternative suggestions (19 Node.js substitutions) — v1.0
- ✓ Atomic backup/restore with rollback on install failure — v1.0

### Active

- [ ] Multi-language dependency management (Python/pip, Go/mod, Rust/cargo)
- [ ] npm audit integration for vulnerability scanning
- [ ] Monorepo/workspace package installation
- [ ] Version constraint intelligence (peer dependency awareness)

### Out of Scope

- GUI or web interface — CLI-first tool
- Cloud-hosted agent — runs locally
- Non-Qwen model optimization — focused on Qwen, though OpenAI-compatible API supports others
- Auto-install without consent — violates user control
- Direct package.json editing — bypasses package manager logic
- Global package installation — pollutes global namespace

## Context

The codebase ships v1.0 automatic dependency management. The pipeline detects missing imports in generated code, validates packages against npm registry, offers built-in Node.js alternatives where available, installs approved packages with user consent, and rolls back on failure. 4,130 LOC source, 3,436 LOC tests, 173 tests passing.

Key modules:
- `src/tools/packageManager.ts` — Lockfile-based PM detection
- `src/tools/packageRegistry.ts` — npm registry validation
- `src/tools/packageInstaller.ts` — Safe package installation via spawn
- `src/tools/dependencyCategorizer.ts` — Prod vs dev categorization
- `src/tools/importValidator.ts` — Import validation with 19-entry SUBSTITUTION_MAP
- `src/tools/installationBackup.ts` — Atomic backup/restore for rollback
- `src/consent/manager.ts` — User consent with alternatives support
- `src/orchestrator/pipeline.ts` — Full pipeline with install + rollback + coder retry

## Constraints

- **Runtime**: Node.js >= 20.0.0
- **LLM Provider**: OpenAI-compatible API (Qwen via Ollama or similar)
- **Package Manager Detection**: Auto-detects npm/pnpm/yarn from lockfiles
- **Safety**: All installations require user consent; failures trigger automatic rollback

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use existing consent manager for install approval | Already built and tested; handles project-level and session-level consent | ✓ Good — extended with BatchApprovalResult for alternatives |
| Auto-detect package manager from lockfiles | Projects use different tools; agent should adapt | ✓ Good — handles npm/pnpm/yarn, rejects ambiguous multi-lockfile projects |
| Install deps as part of pipeline, not post-hoc | Dependencies must be available before code review validates imports | ✓ Good — import validation loop integrates installation before review |
| Sequential prod-then-dev installation | Avoids lock file race conditions from parallel installs | ✓ Good — separate tracking enables correct ImportValidator rebuild |
| Synchronous fs operations for backup/restore | Prevents race conditions; renameSync is atomic on Unix | ✓ Good — timestamp suffixes prevent collision |
| Separate backup boundaries for prod and dev | Preserves successful prod install if only dev fails | ✓ Good — minimizes rollback scope |

---
*Last updated: 2026-02-15 after v1.0 milestone*
