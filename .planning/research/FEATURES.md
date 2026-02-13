# Feature Landscape: Coding Agent Dependency Management

**Domain:** AI coding assistant dependency management
**Researched:** 2026-02-13
**Confidence:** MEDIUM (based on training data from coding assistant ecosystem as of Jan 2025; no real-time verification available)

## Table Stakes

Features users expect from coding agents. Missing these makes the product feel incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Detect missing imports** | Agent-generated code references packages not installed; detection prevents runtime failures | Low | ✓ Already implemented in QwenCodingAgent via `importValidator.ts` |
| **Prompt before installing** | Installing packages modifies project state; users need control | Low | ✓ Already implemented via `ConsentManager` |
| **Auto-detect package manager** | Projects use npm/pnpm/yarn/pip/poetry; agent must adapt to project conventions | Medium | Detect from lock files (pnpm-lock.yaml → pnpm, package-lock.json → npm, yarn.lock → yarn, poetry.lock → poetry, Pipfile → pipenv) |
| **Update manifest files** | Installed packages must persist in package.json/requirements.txt for reproducibility | Medium | Run `npm install --save <pkg>` not manual JSON editing; package manager handles this |
| **Show what's being installed** | Transparency builds trust; users need to see package names and why they're needed | Low | Already in consent flow via `suggestedAlternatives` |
| **Handle scoped packages** | Modern ecosystems use @scope/package; parser must extract correctly | Low | ✓ Already handled in `importValidator.ts` extractImports() |
| **Support devDependencies** | Test/build tools go in devDependencies; agent must categorize correctly | Medium | Heuristic: testing/build/type packages → dev, runtime packages → prod |

## Differentiators

Features that set products apart. Not expected by default, but highly valued when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Suggest built-in alternatives** | Avoid dependency bloat; built-ins are faster and more secure | Low | ✓ Partially implemented via `SUBSTITUTION_MAP` but currently rejects packages rather than offering choice |
| **Version constraint intelligence** | Install compatible versions (e.g., "@types/node matches node version"); prevents version conflicts | High | Requires parsing peer dependencies, checking node version, understanding semver |
| **Batch install with single prompt** | Multiple missing packages → one approval flow; reduces friction | Low | ✓ Already implemented via `checkBatchApproval()` |
| **Explain why package needed** | "Installing 'zod' for schema validation in user.ts:15"; educational and builds trust | Medium | Requires tracking which file/line triggered the import |
| **Rollback on failure** | If install fails or code doesn't work, revert to previous state | High | Requires git integration, snapshot mechanism, or transaction log |
| **Multi-language support** | Handle Node.js, Python, Go, Rust dependency ecosystems | High | Each ecosystem has different conventions (package.json vs requirements.txt vs go.mod vs Cargo.toml) |
| **Lockfile awareness** | Respect existing version pins in pnpm-lock.yaml/package-lock.json | Medium | Use `pnpm add` not manual editing; package manager updates lockfile |
| **Workspace/monorepo support** | Install in correct workspace package, not root | High | Requires detecting workspace config (pnpm-workspace.yaml, lerna.json, nx.json) |
| **Offline/vendored mode** | Work with air-gapped environments or vendored dependencies | High | Check if package exists in node_modules before failing; suggest manual install |
| **Security scanning** | Warn about deprecated/vulnerable packages before installing | High | Integrate with npm audit, socket.dev, or snyk API |

## Anti-Features

Features to explicitly NOT build. These harm user experience or product focus.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Auto-install without consent** | Violates user control; could install malicious packages | Always prompt via consent manager; support session/project-level approval for repeated use |
| **Ignore user's package manager** | Users chose their tool for a reason; overriding breaks workflow | Auto-detect and respect; only fall back to npm if detection fails |
| **Modify package.json directly** | Bypasses package manager logic (scripts, lifecycle hooks, lockfile sync) | Use `pnpm add`, `npm install --save`, `pip install`, etc. |
| **Install globally** | Pollutes global namespace; breaks project isolation | Always install locally (--save or --save-dev) |
| **Silent failures** | User assumes package installed, code fails at runtime | Surface errors clearly; offer retry or manual install instructions |
| **Version pinning without reason** | Overrides user's version strategy (^ vs ~ vs exact) | Let package manager decide; only pin if agent has specific compatibility requirement |
| **Install everything suggested** | Bloats dependencies; some suggestions are optional optimizations | Distinguish required (code won't run) vs optional (performance/DX improvement) |
| **Cross-ecosystem pollution** | Installing npm packages in Python projects or vice versa | Strict ecosystem detection; fail loudly if mismatch detected |

## Feature Dependencies

```
Auto-detect package manager → Update manifest files
    (must know which command to run)

Detect missing imports → Prompt before installing
    (need to know what to prompt for)

Prompt before installing → Update manifest files
    (approval gates installation)

Update manifest files → Lockfile awareness
    (package manager updates lockfile atomically)

Multi-language support → Auto-detect package manager
    (detection logic per ecosystem)

Workspace/monorepo support → Auto-detect package manager
    (workspace-aware commands like `pnpm add --filter`)

Version constraint intelligence → Auto-detect package manager
    (peer dependency resolution differs by tool)

Security scanning → Prompt before installing
    (vulnerability info shown in prompt)
```

## MVP Recommendation

**Phase 1: Core Workflow (Table Stakes)**
Prioritize these to make the feature minimally viable:

1. **Auto-detect package manager** (Medium complexity)
   - Rationale: Foundation for all other features; wrong detection breaks everything
   - Implementation: Check for lock files, fall back to npm

2. **Update manifest files via package manager** (Medium complexity)
   - Rationale: Without this, installs don't persist; defeats purpose of feature
   - Implementation: Run `pnpm add <pkg>` not JSON editing

3. **Handle devDependencies categorization** (Medium complexity)
   - Rationale: Wrong category → production bloat or missing build deps
   - Implementation: Heuristic based on package name patterns (test/build/type keywords)

**Phase 2: User Experience (Table Stakes + Low-Hanging Differentiators)**

4. **Suggest built-in alternatives with choice** (Low complexity)
   - Rationale: Existing SUBSTITUTION_MAP is valuable; let user choose
   - Implementation: Offer "Install axios" vs "Use node:https" in consent prompt

5. **Explain why package needed** (Medium complexity)
   - Rationale: High value for trust and learning; builds on existing context
   - Implementation: Pass file path and import line to consent prompt

6. **Batch install with single prompt** (Low complexity)
   - Rationale: Already implemented; just wire it up
   - Implementation: Use existing `checkBatchApproval()` method

**Defer to Later Phases:**

- **Version constraint intelligence**: High complexity, niche benefit (most users accept latest)
- **Rollback on failure**: High complexity, can be manual for MVP (user runs `git reset`)
- **Multi-language support**: High complexity, can start Node.js-only
- **Workspace/monorepo support**: High complexity, affects minority of projects
- **Security scanning**: High complexity, external API dependencies

## Implementation Notes

### Existing Assets (Already in Codebase)
- ✓ Import detection with regex parser (`importValidator.ts`)
- ✓ Consent flow with session/project scope (`ConsentManager`)
- ✓ Batch approval support (`checkBatchApproval`)
- ✓ Built-in alternative suggestions (`SUBSTITUTION_MAP`)
- ✓ Scoped package name extraction

### Missing Pieces
- Package manager detection logic
- Actual `npm`/`pnpm`/`yarn` command execution
- DevDependency categorization heuristic
- Post-install verification (does import still fail?)
- Error handling for install failures (network, permission, version conflict)

### Integration Points
- **Where to trigger installs**: After coder generates code, before reviewer validates
- **Pipeline flow**: Coder → Import Validator → Consent Manager → Package Installer → Reviewer
- **Failure handling**: If install fails, feed error back to coder to try alternative approach
- **Tool injection**: Package installer needs shell access (already available via toolkit)

## Ecosystem Patterns (Based on Training Data)

### Cursor
- Detects missing imports in real-time as code is generated
- Prompts inline with "Install package?" button
- Uses project's package manager automatically
- Does NOT suggest built-in alternatives (just installs what's referenced)

### GitHub Copilot Workspace
- Detects dependencies in proposed changes
- Shows dependency changes in PR-like diff view
- Batch installs after user approves the plan
- Limited to GitHub-hosted projects (cloud constraint)

### Aider
- Detects imports via static analysis
- Prompts with yes/no for each package
- Runs `pip install` or `npm install` directly
- Simple approach: no version intelligence, no alternative suggestions

### Continue.dev
- Primarily warns about missing imports
- Does not auto-install (delegates to user)
- Philosophy: avoid modifying project state
- Focuses on code generation, not environment management

### Pattern Summary
**Common approach**: Detect → Prompt → Install using project's tool
**Rare**: Built-in alternative suggestions (opportunity for differentiation)
**Universal**: User consent required (no auto-install without approval)

## Confidence Assessment

| Aspect | Confidence | Reasoning |
|--------|-----------|-----------|
| Table stakes features | MEDIUM | Based on training data patterns across multiple coding assistants; cannot verify current state of these tools in 2026 |
| Differentiators | MEDIUM | Feature value propositions are logical extensions; actual market differentiation unknown without current competitive analysis |
| Anti-features | HIGH | These are software engineering best practices (don't bypass package managers, don't install without consent) that hold across time |
| Existing implementation | HIGH | Directly observed from codebase files (importValidator.ts, ConsentManager, etc.) |
| Ecosystem patterns | LOW-MEDIUM | Training data from 2024-2025; tools evolve rapidly; patterns may have changed |

## Sources

**Note**: Without web access, this research relies entirely on training data knowledge of coding assistant behavior patterns as of January 2025. The following should be verified with current documentation:

- Cursor IDE dependency management behavior (last verified: training data)
- GitHub Copilot Workspace features (last verified: training data)
- Aider dependency handling (last verified: training data)
- Continue.dev architecture (last verified: training data)
- QwenCodingAgent codebase (verified: 2026-02-13 via file reads)

**Verification recommended**:
- Current feature sets of Cursor, Copilot Workspace, Aider, Continue.dev in 2026
- Emerging patterns in coding assistant dependency management
- User expectations based on recent product reviews/feedback

## Open Questions

These require either web research or user validation:

1. **Do users expect automatic version updates?** (e.g., if package.json has "zod": "^3.0.0" but latest is 3.24.1, should agent update?)
2. **How do users want conflicts resolved?** (e.g., code wants axios but project uses node:https everywhere)
3. **What's the tolerance for install time?** (if agent needs 5 packages, batch prompt + install vs incremental?)
4. **Do monorepo users expect workspace detection in MVP?** (could be deferred if niche)
5. **Security scanning: must-have or nice-to-have?** (depends on target user base — enterprise vs hobbyist)
