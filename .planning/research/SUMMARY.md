# Project Research Summary

**Project:** QwenCodingAgent - Dependency Management Enhancement
**Domain:** AI Coding Assistant Dependency Management
**Researched:** 2026-02-13
**Confidence:** MEDIUM

## Executive Summary

This project extends QwenCodingAgent with automatic dependency management capabilities. Research reveals that while the existing codebase already has strong foundations (import validation, consent management), it lacks the critical installation execution layer. The recommended approach is a **hybrid reactive-then-proactive architecture** where dependency detection happens post-code-generation, followed by immediate installation with user consent, enabling subsequent tasks to benefit from newly installed dependencies.

The core challenge is balancing automation with security. Automatic dependency installation in AI coding agents introduces severe security risks—primarily dependency injection via LLM hallucination (malicious package installation) and transitive dependency explosion (introducing hundreds of unvetted packages). These risks require **mandatory validation against package registries**, **typosquatting detection**, and **full dependency tree disclosure** before user approval. The recommended stack centers on battle-tested tools: `execa` for safe command execution, `parse-imports` for static import analysis, and ecosystem-specific package manager detection.

The phased approach should prioritize Node.js ecosystem first (highest ROI, existing project is Node-based), validate the architecture with real-world use, then extend to Python/Go/Rust. Critical architectural principle: **never bypass package managers**—all manifest updates must go through `pnpm add`/`npm install` commands to preserve lockfile integrity and avoid breaking package manager invariants.

## Key Findings

### Recommended Stack

Research identified a layered technology stack separating detection, resolution, and execution concerns. The architecture deliberately avoids heavyweight AST parsing (Babel, TypeScript compiler) in favor of lightweight static analysis.

**Core technologies:**
- **execa (^9.0.0)**: Safe command execution with proper stdio, timeout, and error handling—industry standard over raw `child_process`
- **parse-imports (^2.1.0)**: Static import extraction for JS/TS without code execution—faster and safer than full AST parsing
- **which-pm / @pnpm/which-pm (^3.0.0 / ^2.0.0)**: Package manager detection from lockfiles—workspace-aware for monorepos
- **fast-glob (^3.3.2)**: Manifest file discovery across workspace—2-3x faster than glob
- **package-json (^10.0.0)**: Parse and validate package.json with workspace support
- **semver (^7.6.0)**: Version comparison and constraint validation
- **listr2 (^8.0.0)**: Rich terminal progress UI for installation feedback
- **p-queue (^8.0.0)**: Serialized installation to prevent race conditions

**Version caveat:** All versions are from January 2025 training data. Verify current versions before installation.

**Multi-language support:**
- Python: Regex-based import parser (no robust library exists), detect pip/poetry/pipenv from manifests
- Go: Simple regex + `go mod tidy` (standardized tooling handles everything)
- Rust: TOML parser for Cargo.toml, regex for use statements (complex due to crate name mapping)

### Expected Features

**Must have (table stakes):**
- **Auto-detect package manager** — Projects use varied tools (npm/pnpm/yarn/pip); detection from lockfiles is non-negotiable
- **Prompt before installing** — Security and user control mandate explicit consent (already implemented via ConsentManager)
- **Update manifest files** — Packages must persist in package.json for reproducibility; use package manager commands, not manual JSON editing
- **Handle scoped packages** — Modern ecosystems use @scope/package; already handled in importValidator.ts
- **Show what's being installed** — Transparency builds trust; display package names, versions, download counts

**Should have (competitive differentiators):**
- **Suggest built-in alternatives** — Avoid dependency bloat by offering node:crypto instead of uuid (currently implemented but rejects rather than offers choice)
- **Batch install with single prompt** — Multiple missing packages get one approval flow (already implemented via checkBatchApproval)
- **Explain why package needed** — Educational value: "Installing 'zod' for schema validation in user.ts:15"
- **Version constraint intelligence** — Match project's existing version strategy (^ vs ~ vs exact pins)
- **Multi-language support** — Handle Node.js, Python, Go, Rust ecosystems

**Defer (v2+):**
- **Rollback on failure** — High complexity; manual `git reset` acceptable for MVP
- **Security scanning** — Integrate npm audit/socket.dev for vulnerability detection
- **Workspace/monorepo support** — Affects minority of projects; defer to later phase
- **Offline/vendored mode** — Edge case for air-gapped environments

### Architecture Approach

A **layered dependency resolution architecture** integrates into the existing multi-agent pipeline at the import validation loop. Three new components slot between ImportValidator and the review cycle.

**Major components:**
1. **EcosystemDetector** — Detects package manager (pnpm/npm/yarn/pip/poetry/cargo/go) from lockfiles and manifest files; uses multi-signal detection to avoid cross-ecosystem contamination
2. **DependencyResolver** — Maps package names to registry-verified install targets with version resolution; includes fallback chain (registry API → manifest hints → 'latest')
3. **PackageManagerExecutor** — Executes installation commands via ToolKit's safe command runner; validates manifest updates post-install; ensures idempotent operations

**Integration point:** Enhanced import validation loop in `pipeline.ts` (lines 160-223). After ImportValidator detects missing packages and ConsentManager approves them, the new components resolve, install, and rebuild dependency context **before** proceeding to Reviewer. This allows installed packages to be immediately available for validation.

**Key patterns:**
- **Consent-driven installation**: All installs go through existing ConsentManager with session/project scope
- **Fallback chain for version resolution**: Registry API → existing manifest hints → 'latest' tag
- **Idempotent installation**: Filter already-installed packages; safe to retry
- **Package manager as source of truth**: Never manually edit manifests; always use `pnpm add` etc.

### Critical Pitfalls

1. **Dependency Injection via LLM Hallucination** — LLM suggests malicious/typosquatted packages (l0dash instead of lodash). **Prevention:** Validate against registry, check download counts (flag <1000/week), fuzzy-match popular packages, show package metadata in consent prompt.

2. **Transitive Dependency Explosion** — Installing one package pulls 500 transitives with vulnerabilities. **Prevention:** Dry-run dependency resolution before consent, show full tree (at least top-level transitives), flag vulnerable packages, warn if >50 transitives, allow rejection based on tree analysis.

3. **Cross-Ecosystem Contamination** — Wrong ecosystem detection (thinks TypeScript is Python) corrupts project with mixed package managers. **Prevention:** Multi-signal detection (not just file presence), check runtime binaries, parse existing code imports, confirm ecosystem with user on first install, maintain workspace-to-ecosystem mapping.

4. **Installation Side Effects** — Postinstall scripts execute arbitrary code during installation. **Prevention:** Disable install scripts by default (`npm install --ignore-scripts`), audit script contents, show scripts in consent prompt, sandbox execution, require separate consent for script execution.

5. **Concurrent Installation Race Conditions** — Multi-agent parallel execution causes lockfile corruption. **Prevention:** Serialize all install operations via p-queue, batch dependency requests, use file locks to prevent concurrent installs, detect in-progress installations.

6. **Version Pinning vs. Range Hell** — Installing exact versions conflicts with existing pins, or broad ranges introduce breaking changes. **Prevention:** Parse existing version constraints, match project's version strategy, conflict detection before installation, lock file awareness.

7. **Workspace/Monorepo Misdetection** — Install in root when should be in workspace package. **Prevention:** Detect workspace config (pnpm-workspace.yaml, package.json workspaces), map file location to workspace, use workspace-aware commands (pnpm add --filter).

8. **Private Registry/Authentication Blindness** — Attempt to install private packages without credentials. **Prevention:** Read .npmrc/.pypirc configs, detect private scopes (@company/), check authentication before install, clear error messages about auth requirements, never log credentials.

## Implications for Roadmap

Based on research, suggested phase structure follows **foundation-first, then extend** approach:

### Phase 1: Foundation — Ecosystem Detection & Node.js Support
**Rationale:** Simplest component with no external dependencies; existing project is Node.js so immediate value; proves architecture before multi-language complexity.

**Delivers:**
- EcosystemDetector supporting npm/pnpm/yarn detection from lockfiles
- DependencyResolver for Node.js packages with npm registry integration
- PackageManagerExecutor for npm/pnpm/yarn with safe command execution
- Integration into pipeline.ts import validation loop

**Addresses (features):**
- Auto-detect package manager (table stakes)
- Update manifest files via package manager (table stakes)
- Batch install with single prompt (leverage existing checkBatchApproval)

**Avoids (pitfalls):**
- Pitfall 3 (Cross-ecosystem contamination) via multi-signal detection
- Pitfall 6 (Race conditions) via p-queue serialization
- Pitfall 1 (Dependency injection) via registry validation

**Complexity:** Medium — requires ToolKit integration, consent flow modification, registry API integration

### Phase 2: Enhanced User Experience & Safety
**Rationale:** With basic installation working, add differentiating features and critical security layers.

**Delivers:**
- Built-in alternative suggestions with user choice (enhance SUBSTITUTION_MAP)
- Explain why package needed (track file/line that triggered import)
- Transitive dependency analysis and disclosure
- Package validation (download counts, publish date, typosquatting detection)
- Install script auditing and sandboxing

**Uses (stack):**
- semver for version constraint analysis
- npm registry API for package metadata
- Registry APIs for dependency tree dry-run

**Implements (architecture):**
- Fallback chain for version resolution
- Enhanced consent prompts with package metadata

**Avoids (pitfalls):**
- Pitfall 1 (Dependency injection) fully mitigated
- Pitfall 2 (Transitive explosion) via tree disclosure
- Pitfall 4 (Version conflicts) via constraint analysis
- Pitfall 5 (Install scripts) via auditing

**Complexity:** Medium-High — requires registry API integration, vulnerability data sources, sandbox implementation

### Phase 3: Multi-Ecosystem Expansion
**Rationale:** Node.js foundation proven; extend patterns to other languages following same architecture.

**Delivers:**
- Python ecosystem support (pip/poetry/pipenv)
- Ecosystem-specific import parsers (regex for Python/Go/Rust)
- Manifest parsing for requirements.txt, pyproject.toml, go.mod, Cargo.toml
- Package manager command execution for pip, go mod, cargo

**Uses (stack):**
- toml library for Cargo.toml/pyproject.toml
- ini library for setup.cfg
- Ecosystem-specific registry APIs (PyPI, crates.io, pkg.go.dev)

**Addresses (features):**
- Multi-language support (differentiator)

**Avoids (pitfalls):**
- Pitfall 3 (Cross-ecosystem contamination) via strict ecosystem boundaries

**Complexity:** Medium — extends proven architecture; each ecosystem adds parser + executor but follows same pattern

### Phase 4: Advanced Features (v2+)
**Rationale:** High complexity, lower ROI; defer until core functionality stable and validated.

**Delivers:**
- Workspace/monorepo support with workspace: protocol
- Security scanning integration (npm audit, socket.dev)
- Version constraint intelligence (peer dependency resolution)
- Rollback on installation failure
- Private registry authentication handling
- DevDependency categorization heuristics

**Complexity:** High — each feature is complex and affects minority of users or requires external API integrations

### Phase Ordering Rationale

- **Foundation-first approach**: Phase 1 establishes architecture without multi-language complexity; validates approach with existing Node.js project before expanding.
- **Security layered in Phase 2**: Basic functionality (Phase 1) gets users value quickly; security enhancements (Phase 2) come before multi-language (Phase 3) to ensure safe patterns established.
- **Ecosystem expansion follows proven pattern**: Each ecosystem in Phase 3 reuses EcosystemDetector/DependencyResolver/PackageManagerExecutor interfaces; reduces risk.
- **Defer complexity**: Workspace support (Phase 4) affects <20% of projects; security scanning requires external APIs; rollback needs git integration. All high-effort, lower-return until core is stable.

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 2 (Security):** Typosquatting detection algorithms; best practices for install script sandboxing; current state of npm audit API (2026 changes unknown)
- **Phase 3 (Python):** Python import resolution complexity (relative imports, namespace packages); pip vs poetry vs uv (emerging tool as of 2025)
- **Phase 3 (Rust):** Crate name to module name mapping heuristics; crates.io API current capabilities
- **Phase 4 (Workspaces):** Current best practices for monorepo dependency management; changes to pnpm workspaces protocol since 2025

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Node.js):** Well-documented npm/pnpm/yarn behavior; established registry API; existing import validation code provides pattern
- **Phase 3 (Go):** Go has standardized tooling; `go mod tidy` auto-resolves; simple and well-documented

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-LOW | Libraries recommended are sound based on training data, but versions unverified; parse-imports maintenance status unknown for 2026 |
| Features | MEDIUM | Feature landscape based on training data from Cursor/Copilot/Aider as of 2025; current state in 2026 unknown; existing codebase analysis is HIGH confidence |
| Architecture | HIGH | Based on direct codebase analysis; integration points clearly identified; patterns are established software engineering practices |
| Pitfalls | MEDIUM | Security risks (typosquatting, install scripts) are well-documented timeless threats (HIGH confidence); agent-specific pitfalls (LLM hallucination) are logical inference (MEDIUM confidence) |

**Overall confidence:** MEDIUM

### Gaps to Address

**Stack verification needed:**
- Confirm parse-imports is maintained in 2026; check for better alternatives emerged
- Verify which-pm vs @pnpm/which-pm current best practice for workspace detection
- Validate all package versions against current npm registry
- Research if better import parsers for Python/Go/Rust exist

**Feature validation needed:**
- Check current state of Cursor/Copilot/Aider dependency management in 2026 (competitive analysis)
- Validate user expectations via existing issues in QwenCodingAgent or similar projects
- Determine if monorepo support is must-have based on user base

**Pitfall verification needed:**
- Research current typosquatting detection services/APIs available in 2026
- Check latest npm/pnpm security features (sandbox modes, audit API changes)
- Validate install script attack vectors are still relevant (npm may have added sandboxing)

**Architecture validation:**
- Test ToolKit command execution allowlist accommodates package manager commands
- Verify ConsentManager can display extended metadata (transitive deps, security info)
- Confirm 60s timeout in ToolKit is sufficient for package installations

**Handling during implementation:**
- **Phase 1 kickoff:** Verify stack packages are current; adjust if better alternatives exist
- **Pre-Phase 2:** Research typosquatting detection; may need custom service or registry API enhancements
- **Pre-Phase 3:** Deep dive each ecosystem (Python/Go/Rust) import resolution specifics
- **Throughout:** Monitor for security advisories on dependency management; adapt approach as needed

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** (verified 2026-02-13):
  - `/home/reset/Coding/QwenCodingAgent/src/orchestrator/pipeline.ts` — integration point for dependency management
  - `/home/reset/Coding/QwenCodingAgent/src/tools/importValidator.ts` — existing import detection and validation
  - `/home/reset/Coding/QwenCodingAgent/src/consent/manager.ts` — existing consent flow architecture
  - `/home/reset/Coding/QwenCodingAgent/src/tools/toolkit.ts` — command execution infrastructure
  - `/home/reset/Coding/QwenCodingAgent/src/tools/dependencyContext.ts` — current dependency context building

### Secondary (MEDIUM confidence)
- **Package manager conventions** (training data, Jan 2025):
  - npm/pnpm/yarn standard behaviors and lockfile formats
  - Python packaging (pip/poetry/pipenv) manifest conventions
  - Go modules and Rust Cargo package management
  - Registry API patterns (npmjs.org, PyPI, crates.io)

- **Coding assistant patterns** (training data, 2024-2025):
  - Cursor IDE dependency management behavior
  - GitHub Copilot Workspace features
  - Aider dependency handling approach
  - Continue.dev architecture

### Tertiary (LOW confidence)
- **Security threat landscape** (training data):
  - npm typosquatting attacks (event-stream, left-pad incidents)
  - Install script attack vectors
  - Supply chain security best practices
  - OWASP Dependency Confusion patterns

**Verification recommended:**
- npm/pnpm official security documentation (current as of 2026)
- parse-imports GitHub repository (maintenance status, latest version)
- Socket.dev or Snyk APIs for security scanning integration
- Cursor/Copilot/Aider current feature sets (competitive analysis)

---
*Research completed: 2026-02-13*
*Ready for roadmap: Yes*
*Researcher notes: All four research files synthesized. Core recommendation is phased Node.js-first approach with security layered before multi-language expansion. Critical gaps are stack package verification and current security API landscape.*
