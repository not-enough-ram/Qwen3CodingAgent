# QwenCodingAgent

## What This Is

A multi-agent coding assistant powered by the open-source Qwen model. It takes a user's coding request and runs it through a pipeline of specialized agents (planner, architect, coder, reviewer) to produce working code changes. Built in TypeScript, runs as a CLI tool.

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

### Active

- [ ] Auto-detect and install missing dependencies when agent generates code
- [ ] Multi-language dependency management (Node/npm, Python/pip, etc.)
- [ ] Update manifest files (package.json, requirements.txt, etc.) after installing packages

### Out of Scope

- GUI or web interface — CLI-first tool
- Cloud-hosted agent — runs locally
- Non-Qwen model optimization — focused on Qwen, though OpenAI-compatible API supports others

## Context

The codebase already has an import validation system (`src/tools/importValidator.ts`) that detects when generated code references packages not in the project's dependencies. Currently, it feeds this information back to the coder agent to rewrite code avoiding those packages. The missing piece is actually installing the needed packages instead of working around them.

The consent manager (`src/consent/`) already handles user approval for package installations — the plumbing exists but isn't connected to actual package manager invocations.

Key concern from codebase audit: "When import validation forces coder to use alternatives, doesn't install missing packages. Suggested fixes may reference non-installed packages; workflow incomplete."

## Constraints

- **Runtime**: Node.js >= 20.0.0
- **LLM Provider**: OpenAI-compatible API (Qwen via Ollama or similar)
- **Package Manager Detection**: Must auto-detect project ecosystem (npm/pnpm/yarn, pip/poetry, etc.)
- **Safety**: Package installations require user consent (consent manager already exists)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use existing consent manager for install approval | Already built and tested; handles project-level and session-level consent | — Pending |
| Auto-detect package manager from project files | Projects use different tools; agent should adapt | — Pending |
| Install deps as part of pipeline, not post-hoc | Dependencies must be available before code review validates imports | — Pending |

---
*Last updated: 2026-02-13 after initialization*
