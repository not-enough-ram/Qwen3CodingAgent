# Phase 1: Ecosystem Detection & Package Manager Support - Context

**Gathered:** 2026-02-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Auto-detect Node.js package managers (npm/pnpm/yarn) and execute approved package installations. This phase builds the foundation: detection, installation execution, and manifest updates. Import analysis, safety validation, and UX improvements are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Detection strategy
- Check lock files first: pnpm-lock.yaml → pnpm, package-lock.json → npm, yarn.lock → yarn
- Also check package.json "packageManager" field (corepack support)
- If no lock file exists, default to npm (always available with Node.js)
- If multiple lock files exist, prompt the user to choose which PM to use
- Detection caching: Claude's discretion on whether to detect once per run or per task

### Install command behavior
- Show PM output to the user in real-time (not silent)
- Use default caret (^) version ranges — just run `pnpm add zod`, accept PM defaults
- Batch all missing packages into one install command (e.g., `pnpm add zod axios lodash`)
- Peer dependency handling: Claude's discretion

### Consent flow integration
- Consent granularity: Claude's discretion (fits existing ConsentManager patterns)
- Approvals are session-only — forget when CLI exits
- Consent prompt must show: package name + version, why it's needed (which file/import), and the install command that will run
- Support a --yes or --auto-install flag that skips consent prompts for the session

### Failure handling
- If install fails (network, not found, etc.): feed error back to coder agent to rewrite using alternatives
- If user rejects a package: feed back to coder to rewrite without that package
- Validate package exists on npm registry BEFORE showing consent prompt (prevents typos/hallucinations)
- After successful install: re-run import validation to verify imports actually resolve

### Claude's Discretion
- Detection caching strategy (once per run vs per task)
- Consent granularity (batch vs per-package — whatever fits existing ConsentManager)
- Peer dependency warning handling
- Exact consent prompt formatting

</decisions>

<specifics>
## Specific Ideas

- Registry validation before consent is important — the Qwen model may hallucinate package names, and prompting the user to install a non-existent package would be confusing
- The feedback loop on failure mirrors how the current import validation works (tells coder to rewrite) — this should extend that pattern, not replace it
- Real-time PM output matters for transparency — user should see what's happening

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-ecosystem-detection*
*Context gathered: 2026-02-13*
