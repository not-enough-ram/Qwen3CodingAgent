# Technology Stack: Dependency Management

**Project:** QwenCodingAgent - Dependency Management Enhancement
**Researched:** 2025-02-13
**Overall Confidence:** MEDIUM-LOW (unable to verify with Context7/official docs due to tool restrictions)

## Research Limitations

**CRITICAL:** This research was conducted without access to verification tools (Context7, WebSearch, official documentation). All recommendations are based on training data current to January 2025 and may not reflect the latest versions or best practices. **Verify all versions and capabilities before implementation.**

## Recommended Stack

### Core Dependency Detection

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **execa** | ^9.0.0 | Command execution | Industry standard for running package managers safely. Handles stdio, errors, cancellation. Better than child_process. |
| **which-pm** | ^3.0.0 | Package manager detection | Detects npm/pnpm/yarn/bun from lockfiles and package.json. More reliable than which-pm-runs for detection-only use case. |
| **fast-glob** | ^3.3.2 | File pattern matching | Find package manifests (package.json, requirements.txt, go.mod, Cargo.toml) across workspace. 2-3x faster than glob. |

### Language Ecosystem Support

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **package-json** | ^10.0.0 | Parse package.json | Handles workspaces, version ranges, validates schema. From sindresorhus (trusted). |
| **parse-imports** | ^2.1.0 | Extract JS/TS imports | Static analysis of import/require statements without executing code. Critical for detecting missing deps. |
| **@pnpm/which-pm** | ^2.0.0 | Workspace-aware PM detection | Better than which-pm for monorepos/workspaces. Part of pnpm tooling but standalone. |

### Manifest File Parsing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **toml** | ^3.0.0 | Parse Rust Cargo.toml | Standard TOML parser. Rust uses TOML for Cargo.toml manifests. |
| **ini** | ^5.0.0 | Parse Python setup.cfg | Parse INI-format Python config files. Minimal, stable. |

### Command Execution & Safety

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **execa** | ^9.0.0 | Safe command execution | (duplicate entry - see Core) Promise-based, proper stdio handling, timeout support. |
| **p-queue** | ^8.0.0 | Rate limiting installs | Prevent parallel install conflicts. Serial execution with concurrency control. |
| **listr2** | ^8.0.0 | Progress UI | Rich terminal UI for install progress. Better UX than raw console.log. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **semver** | ^7.6.0 | Version comparison | Validate installed versions meet requirements. Check if dep already satisfied. |
| **validate-npm-package-name** | ^6.0.0 | Package name validation | Ensure extracted package names are valid before attempting install. |
| **pkg-dir** | ^8.0.0 | Find project root | Locate nearest package.json/manifest. Handles nested projects correctly. |
| **read-pkg** | ^9.0.0 | Read package.json | Type-safe package.json reading with normalization. Alternative to package-json. |

## Ecosystem-Specific Strategies

### Node.js/JavaScript/TypeScript

**Manifest Files:** package.json
**Package Managers:** npm, pnpm, yarn, bun
**Detection Strategy:**

1. Use **parse-imports** to extract import/require statements
2. Cross-reference against package.json dependencies
3. Detect package manager with **@pnpm/which-pm** or **which-pm**
4. Execute install with **execa**

**Why not AST parsing?** parse-imports is faster and sufficient for imports. No need for full AST (babel/typescript parser) overhead.

### Python

**Manifest Files:** requirements.txt, setup.py, pyproject.toml, Pipfile
**Package Managers:** pip, pipenv, poetry, uv
**Detection Strategy:**

1. Use regex or simple parsing for import statements (import X, from X import Y)
2. Check PyPI package existence (optional validation)
3. Detect manager: pyproject.toml with [tool.poetry] = poetry, Pipfile = pipenv, else pip
4. Parse existing manifest with fs.readFile + custom parser (requirements.txt is simple line format)

**Libraries:** No robust import parser. Use regex: `^(?:from\s+(\S+)|import\s+(\S+))`

### Go

**Manifest Files:** go.mod, go.sum
**Package Managers:** go mod
**Detection Strategy:**

1. Use regex for imports: `import\s+"([^"]+)"`
2. Parse go.mod with custom parser (simple format)
3. Run `go mod tidy` to auto-resolve dependencies

**Why simple?** Go has standardized tooling. `go mod tidy` handles everything.

### Rust

**Manifest Files:** Cargo.toml, Cargo.lock
**Package Managers:** cargo
**Detection Strategy:**

1. Use regex for use statements: `use\s+([a-z_][a-z0-9_]*)`
2. Parse Cargo.toml with **toml** library
3. Map crate names (may differ from use statement - requires crates.io lookup or heuristics)
4. Run `cargo add <crate>` or edit Cargo.toml + `cargo check`

**Complexity:** Crate names != module names. Example: `use serde_json` → crate `serde_json`, but `use tokio` could be from `tokio` or `tokio-*`. Needs heuristics.

## Architecture Recommendations

### Component Structure

```
src/dependencies/
├── detector.ts          # Main orchestrator
├── ecosystems/
│   ├── base.ts         # Abstract ecosystem interface
│   ├── nodejs.ts       # Node.js implementation
│   ├── python.ts       # Python implementation
│   ├── go.ts           # Go implementation
│   └── rust.ts         # Rust implementation
├── parsers/
│   ├── imports.ts      # Import extraction (uses parse-imports for JS/TS)
│   ├── manifests.ts    # Manifest file parsing
│   └── lockfiles.ts    # Lockfile parsing (optional)
├── installers/
│   ├── executor.ts     # Command execution (uses execa)
│   └── queue.ts        # Install queue (uses p-queue)
└── validators/
    ├── existence.ts    # Check if package exists in registry
    └── version.ts      # Version compatibility (uses semver)
```

### Data Flow

```
1. Detect project type (find manifest files with fast-glob)
2. Instantiate ecosystem handler
3. Extract imports from generated code (parse-imports or regex)
4. Compare against existing manifest
5. Identify missing dependencies
6. Request user consent (existing consent manager)
7. Execute install (execa + p-queue)
8. Update manifest if needed
9. Verify installation (optional)
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Import parsing (JS/TS) | parse-imports | @babel/parser + traverse | Babel is 10x heavier, slower. Overkill for simple import extraction. |
| Import parsing (JS/TS) | parse-imports | typescript compiler API | TypeScript parser requires type resolution. parse-imports is static only, faster. |
| Command execution | execa | child_process | execa has better error handling, stdio, cancellation, cleaner API. |
| Package manager detection | which-pm | which-pm-runs | which-pm-runs detects PM that ran current script. Need detection of project's PM. |
| Package manager detection | @pnpm/which-pm | custom implementation | @pnpm/which-pm handles workspaces, edge cases. Battle-tested. |
| Manifest parsing | package-json | JSON.parse | package-json normalizes, validates, handles workspaces. |
| Progress UI | listr2 | ora | listr2 supports nested tasks, concurrent tasks. ora is single spinner. |
| File search | fast-glob | glob | fast-glob is 2-3x faster, better API. |
| TOML parsing | toml | @iarna/toml | toml is more actively maintained (as of Jan 2025 training data). |

## Installation

```bash
# Core dependencies
pnpm add execa which-pm fast-glob parse-imports package-json semver

# Workspace-aware PM detection
pnpm add @pnpm/which-pm

# Manifest parsing
pnpm add toml ini

# Progress & queue
pnpm add listr2 p-queue

# Utilities
pnpm add validate-npm-package-name pkg-dir

# Dev dependencies (types)
pnpm add -D @types/node @types/ini
```

## Implementation Priorities

### Phase 1: Node.js Ecosystem (High ROI)
- **Why:** Existing project is Node.js. Highest value, fastest to implement.
- **Scope:** parse-imports + which-pm + execa
- **Complexity:** Low

### Phase 2: Python Ecosystem (Medium ROI)
- **Why:** Common AI/ML tool language. Python deps in coding projects.
- **Scope:** Regex import parser + pip detection
- **Complexity:** Medium (multiple manifest formats)

### Phase 3: Go Ecosystem (Medium-Low ROI)
- **Why:** Simple tooling, auto-resolve with `go mod tidy`
- **Scope:** Regex import parser + go.mod detection
- **Complexity:** Low (standardized tooling)

### Phase 4: Rust Ecosystem (Low ROI, High Complexity)
- **Why:** Less common in general coding tasks. Crate name mapping is complex.
- **Scope:** Regex use parser + Cargo.toml parsing + heuristics
- **Complexity:** High (name mapping ambiguity)

## Anti-Patterns to Avoid

### DON'T: Execute arbitrary code to detect imports

**Why:** Security risk. Code might have side effects, require specific environment.
**Instead:** Static analysis only (parse-imports, regex)

### DON'T: Install without user consent

**Why:** Security, user control, unexpected costs (private registries).
**Instead:** Use existing consent manager, show what will be installed

### DON'T: Parallel installs across package managers

**Why:** Race conditions, corrupted node_modules, lockfile conflicts.
**Instead:** Use p-queue with concurrency: 1 per ecosystem

### DON'T: Assume package name = import name

**Why:** Scoped packages (@org/pkg), renamed imports, ecosystem differences (Rust crates).
**Instead:** Maintain mapping rules per ecosystem

### DON'T: Skip lockfile updates

**Why:** Lockfiles ensure reproducible builds. Skipping breaks determinism.
**Instead:** Let package manager handle lockfile (automatic with install commands)

## Version Strategy

**All versions listed are approximate based on January 2025 training data.**

**CRITICAL: Verify current versions before installation:**

```bash
# Check latest versions
pnpm info execa version
pnpm info parse-imports version
pnpm info which-pm version
# ... repeat for all packages
```

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Incorrect package detection | High | Validate package names, check registry existence before install |
| Package manager conflicts | High | Serial execution per ecosystem (p-queue), detect correct PM |
| Import extraction false positives | Medium | Validate extracted names, manual review in consent flow |
| Unsupported ecosystems | Medium | Graceful degradation, clear error messages |
| Network failures during install | Medium | Retry logic in execa, timeout handling |
| Manifest file corruption | Low | Backup manifests before modification, validate after |

## Open Questions

**Unable to verify due to tool restrictions:**

1. **Current versions:** Are recommended versions still current? (Verify with npm registry)
2. **parse-imports status:** Is parse-imports maintained in 2025? (Check GitHub/npm)
3. **Alternative import parsers:** Has a better solution emerged for cross-language import detection?
4. **Package manager evolution:** Have new PMs (bun, etc.) changed detection strategies?
5. **Workspace support:** Does @pnpm/which-pm still handle all workspace types correctly?

**Recommend manual verification of:**
- All package versions (npm, GitHub)
- parse-imports maintenance status
- which-pm vs @pnpm/which-pm current best practice
- Ecosystem-specific registry APIs (PyPI, crates.io, pkg.go.dev)

## Confidence Breakdown

| Component | Confidence | Reason |
|-----------|------------|--------|
| execa | HIGH | Established standard, unlikely to change |
| parse-imports | MEDIUM | Assumes still maintained (verify) |
| which-pm ecosystem | MEDIUM | Multiple options, need current best practice |
| Ecosystem strategies | MEDIUM | Patterns stable, but tooling may have evolved |
| Versions | LOW | Cannot verify current versions |
| Overall Stack | MEDIUM-LOW | Conceptually sound, needs verification |

## Sources

**WARNING: No sources verified. All recommendations based on training data (cutoff: January 2025).**

**Required verification:**
- npm registry for current versions
- GitHub repositories for maintenance status
- Official documentation for parse-imports, execa, which-pm, @pnpm/which-pm
- Ecosystem-specific tooling docs (pip, cargo, go mod)

**Next steps:**
1. Verify tool availability and versions
2. Check parse-imports alternatives if unmaintained
3. Validate workspace detection approach
4. Research ecosystem-specific registry APIs
5. Test import extraction accuracy across languages
