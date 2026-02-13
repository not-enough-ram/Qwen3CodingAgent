# Domain Pitfalls: Automatic Dependency Management in Coding Agents

**Domain:** LLM-based coding agents with automatic dependency installation
**Researched:** 2026-02-13
**Confidence:** MEDIUM (based on training data - external verification unavailable)

## Critical Pitfalls

Mistakes that cause security vulnerabilities, rewrites, or major issues.

### Pitfall 1: Dependency Injection via LLM Hallucination
**What goes wrong:** LLM hallucinates malicious or non-existent package names that get auto-installed without verification. Agent installs `lodash` when LLM meant `lodash` but suggested `l0dash` (typosquatting package).

**Why it happens:**
- LLMs don't have real-time package registry access
- Training data may include malicious package examples
- No validation between "LLM suggested this import" and "package actually exists in registry"

**Consequences:**
- Installation of malicious packages that execute arbitrary code
- Supply chain attacks on user systems
- Credential theft, data exfiltration
- Complete system compromise

**Prevention:**
1. **Validate package names against official registries** before installation
2. **Check package popularity/downloads** - flag packages with <1000 weekly downloads
3. **Typosquatting detection** - fuzzy match against known popular packages, warn on near-matches
4. **Sandboxed verification** - check package contents before actual installation
5. **User consent with package details** - show package name, version, download count, last publish date

**Detection:**
- LLM suggests packages with unusual names (l33t speak, near-matches to popular packages)
- Package has very low download counts
- Package recently published (less than 30 days old)
- Package name differs by 1-2 characters from popular package

**Phase mapping:** Phase 1 (Package Detection & Validation) - MUST be addressed before any auto-install

---

### Pitfall 2: Transitive Dependency Explosion
**What goes wrong:** Agent installs a package that pulls in hundreds of transitive dependencies, many with known vulnerabilities or conflicting versions. User doesn't consent to the 500 packages that come with the 1 they approved.

**Why it happens:**
- Package managers resolve entire dependency trees automatically
- User consent only covers direct dependencies
- No visibility into what transitive dependencies will be installed
- No budget/limit on dependency count

**Consequences:**
- Massive disk usage (node_modules bloat)
- Long installation times that appear frozen
- Conflicting dependency versions break existing code
- Introduction of vulnerable dependencies user never explicitly approved
- Supply chain attack surface expansion

**Prevention:**
1. **Dry-run dependency resolution** before asking for consent
2. **Show full dependency tree** in consent prompt (at least top-level transitives)
3. **Flag vulnerable dependencies** in tree (integrate with `npm audit`, `pip-audit`, etc.)
4. **Set dependency count thresholds** - warn if package pulls >50 transitives
5. **Allow user to reject** based on transitive analysis
6. **Cache dependency trees** for common packages to speed up checks

**Detection:**
- Package has >50 dependencies in tree
- Dependency tree includes packages with known CVEs
- Conflicting version requirements detected
- Installation time exceeds expected duration

**Phase mapping:** Phase 2 (Dependency Resolution & Analysis) - Must precede auto-install

---

### Pitfall 3: Cross-Ecosystem Contamination
**What goes wrong:** Agent detects wrong ecosystem (thinks TypeScript project is Python because of config file) and installs packages with wrong package manager, corrupting project structure.

**Why it happens:**
- Multiple ecosystems in monorepo (frontend + backend)
- Ambiguous file patterns (.json used by both npm and other tools)
- LLM generates code for wrong language context
- Workspace detection logic too simplistic

**Consequences:**
- `package.json` created in Python-only project
- `requirements.txt` created in Node-only project
- Mixed package managers in same directory (npm + yarn + pnpm)
- Lockfile conflicts and corruption
- Build system completely breaks

**Prevention:**
1. **Multi-signal ecosystem detection** (not just file presence)
   - Check for runtime binaries (node, python, go)
   - Parse existing package manager files
   - Detect by import statement patterns in existing code
   - Check for language-specific build configs
2. **Explicit workspace boundaries** in monorepos
3. **Reject mixed package managers** in same workspace
4. **Confirm ecosystem** with user before first install in workspace
5. **Maintain workspace-to-ecosystem mapping** in agent state

**Detection:**
- Multiple package manager lockfiles in same directory
- Import statements don't match detected ecosystem
- Package manager binary not found for detected ecosystem
- Conflicting language-specific config files

**Phase mapping:** Phase 1 (Ecosystem Detection) - Must be rock-solid before proceeding

---

### Pitfall 4: Version Pinning vs. Range Hell
**What goes wrong:** Agent either:
- Installs exact versions that immediately conflict with existing pins
- Uses broad ranges (`^1.0.0`) that pull breaking changes

**Why it happens:**
- No analysis of existing version constraints in project
- LLM doesn't understand semver semantics
- Trying to be "helpful" by using latest versions
- No conflict detection before installation

**Consequences:**
- Breaking changes introduced silently
- Type errors from incompatible API versions
- Build failures in CI/CD (works locally, fails in CI due to range resolution)
- Dependency hell requiring manual resolution

**Prevention:**
1. **Parse existing version constraints** before adding new ones
2. **Match project's version strategy** (if all dependencies use exact versions, continue that pattern)
3. **Conflict detection** - check if new dependency's requirements conflict with existing
4. **Default to conservative ranges** - prefer `~` over `^` for new additions
5. **Lock file awareness** - respect existing locked versions
6. **Version compatibility check** - use registry metadata to check compatibility

**Detection:**
- New dependency has version requirements incompatible with existing packages
- Package manager reports peer dependency warnings
- New package requires different major version of shared dependency

**Phase mapping:** Phase 2 (Dependency Resolution & Analysis) - Critical for conflict-free installs

---

### Pitfall 5: Installation Side Effects
**What goes wrong:** Package installation runs arbitrary scripts (postinstall hooks) that modify system, access network, or execute malicious code before user realizes what's happening.

**Why it happens:**
- npm/pip/etc. execute install scripts by default
- No sandboxing of install scripts
- User consent happens before script execution visibility
- Agent doesn't audit install scripts

**Consequences:**
- Malicious code execution during install
- System modification outside project directory
- Network calls to untrusted endpoints
- Cryptomining, data exfiltration, backdoor installation
- Complete system compromise

**Prevention:**
1. **Disable install scripts by default** (`npm install --ignore-scripts`)
2. **Audit install scripts** before installation
3. **Show script contents** in consent prompt if scripts present
4. **Sandboxed installation** in isolated environment first
5. **Warn on network-calling scripts**
6. **Provide script execution as separate consent** after package installation

**Detection:**
- Package has postinstall/preinstall scripts
- Script content includes network calls (curl, wget, fetch)
- Script modifies files outside package directory
- Script requires elevated privileges

**Phase mapping:** Phase 3 (Secure Installation) - Must be addressed before production use

---

### Pitfall 6: Concurrent Installation Race Conditions
**What goes wrong:** Agent generates multiple files in parallel, each triggering dependency detection/installation simultaneously. Package manager lock file gets corrupted or installations conflict.

**Why it happens:**
- Multi-agent architecture with parallel execution
- No coordination between dependency installation requests
- Package managers not designed for concurrent installs
- Lock file write conflicts

**Consequences:**
- Corrupted lock files requiring manual deletion
- Partial installations leaving broken state
- Duplicate dependency installations
- Wasted time and resources
- Non-deterministic failures

**Prevention:**
1. **Dependency installation queue** - serialize all install operations
2. **Batch dependency requests** - collect all needed packages before single install
3. **Lock-based coordination** - use file lock to prevent concurrent installs
4. **Detect in-progress installations** before starting new one
5. **Transaction-based approach** - plan all changes, execute atomically
6. **Post-generation consolidation** - analyze all generated code, install all dependencies in one operation

**Detection:**
- Multiple package manager processes running simultaneously
- Lock file modified timestamp changes mid-operation
- Package manager errors about lock file conflicts
- Partial dependency installations

**Phase mapping:** Phase 1 (Orchestration) - Architecture decision that affects all phases

---

### Pitfall 7: Workspace/Monorepo Misdetection
**What goes wrong:** In monorepo with workspaces (pnpm workspaces, npm workspaces, Go modules with replace directives), agent installs dependencies in wrong location - root vs. workspace package.

**Why it happens:**
- Workspace configuration not parsed
- LLM generates code without workspace context
- Agent doesn't understand workspace protocol (workspace:* versions)
- No workspace root detection logic

**Consequences:**
- Dependencies installed in root when they should be in workspace
- Workspace protocol violated (uses npm registry instead of workspace: link)
- Duplicate dependencies across workspaces
- Build failures due to missing workspace links
- Phantom dependencies (works due to hoisting but not declared)

**Prevention:**
1. **Detect workspace configuration** (pnpm-workspace.yaml, package.json workspaces, go.work)
2. **Map file location to workspace** before installation
3. **Respect workspace protocols** - use workspace: versions for internal packages
4. **Install in correct workspace directory** not root
5. **Use workspace-aware commands** (pnpm add --filter, etc.)
6. **Validate against workspace dependency graph**

**Detection:**
- Workspace config exists but not being used
- Dependencies duplicated across workspaces
- Missing workspace: protocol for internal dependencies
- Package installed in root when workspace-specific

**Phase mapping:** Phase 1 (Ecosystem Detection) - Must handle workspaces from start

---

### Pitfall 8: Private Registry/Authentication Blindness
**What goes wrong:** Agent tries to install private packages without authentication, fails silently or with unclear errors. User has configured `.npmrc` or pip config for private registry, but agent doesn't use it.

**Why it happens:**
- Agent doesn't read package manager config files
- Environment variables (NPM_TOKEN) not available to agent process
- LLM suggests private package names that don't exist in public registry
- No detection of private package scopes (@company/package)

**Consequences:**
- Installation failures with authentication errors
- Fallback to public registry finds wrong package (namespace collision)
- Credentials exposed in error messages/logs
- Cannot install legitimate private dependencies
- User forced to manual installation

**Prevention:**
1. **Read package manager configs** (.npmrc, .pypirc, etc.)
2. **Detect private package patterns** (@scope/ prefixes, private registry domains)
3. **Check for authentication** before attempting private package install
4. **Clear error messages** about authentication requirements
5. **Guide user to authenticate** rather than failing silently
6. **Respect registry configuration** from existing config files
7. **Never log/expose credentials** in error messages

**Detection:**
- Package name matches private scope pattern
- Registry URL in config points to non-public registry
- 401/403 errors from package manager
- Authentication token environment variables not set

**Phase mapping:** Phase 2 (Registry Integration) - Required for enterprise/private package support

---

### Pitfall 9: Circular Dependency Detection Failure
**What goes wrong:** Agent generates code that creates circular dependencies (A depends on B, B depends on A), installs packages, and breaks the build.

**Why it happens:**
- LLM doesn't track cross-file dependency graph
- Each file generated independently without global context
- Package manager allows installation but runtime fails
- No validation of import cycles before installation

**Consequences:**
- Runtime errors (circular dependency detected)
- Build failures in bundlers
- Infinite loops during module initialization
- Unclear error messages blaming packages, not agent's code structure

**Prevention:**
1. **Import graph analysis** after code generation, before installation
2. **Detect circular imports** in generated code
3. **Validate import graph** is acyclic
4. **Refactor to break cycles** before proceeding
5. **Warn user** if circular dependency detected in design

**Detection:**
- Import statements form cycle in generated files
- Runtime error: "Cannot access X before initialization"
- Bundler warnings about circular dependencies
- Module initialization order issues

**Phase mapping:** Phase 2 (Import Validation) - Extends existing import validator

---

### Pitfall 10: Dependency Drift Between Generations
**What goes wrong:** Agent generates code at different times using different versions of same library (session 1 uses v1.0, session 2 uses v2.0 with breaking changes), causing incompatibilities.

**Why it happens:**
- No persistent context about previously installed versions
- LLM training data includes multiple version examples
- Agent doesn't check currently installed versions before generating code
- Package manager defaults to "latest"

**Consequences:**
- Generated code uses API that doesn't exist in installed version
- Type mismatches between files
- Runtime errors from version incompatibilities
- Manual reconciliation required

**Prevention:**
1. **Read installed package versions** before code generation
2. **Include version info in LLM context** for code generation
3. **Version-aware code generation** - use APIs compatible with installed version
4. **Detect version-specific APIs** in generated code
5. **Upgrade prompts** - ask user if new version should be installed when LLM suggests newer API

**Detection:**
- Generated code uses API not present in installed version
- Type errors referencing non-existent types
- Import paths that don't exist in current version

**Phase mapping:** Phase 2 (Version Context) - Coordination between code gen and dependency management

---

## Moderate Pitfalls

### Pitfall 11: Dev vs. Production Dependency Confusion
**What goes wrong:** Agent installs all dependencies as production dependencies even when they're dev-only (testing, build tools).

**Prevention:**
- Classify dependencies based on usage context (test files → devDependencies)
- Respect existing project patterns for dev vs. prod
- Use correct package manager flags (--save-dev, --dev, etc.)

---

### Pitfall 12: Global vs. Local Installation Mistakes
**What goes wrong:** Agent installs CLI tools locally when they should be global, or vice versa.

**Prevention:**
- Detect CLI usage patterns (in package.json scripts → local)
- Never install globally without explicit user consent
- Prefer local installations with npx/pnpm dlx patterns

---

### Pitfall 13: Peer Dependency Resolution Failures
**What goes wrong:** Agent installs package without satisfying peer dependencies, causing warnings/errors.

**Prevention:**
- Check peer dependency requirements before installation
- Resolve peer dependencies automatically or prompt user
- Validate peer dependency compatibility with existing packages

---

### Pitfall 14: Platform-Specific Dependency Failures
**What goes wrong:** Agent installs packages with native bindings that fail on user's platform (Windows/Linux/Mac).

**Prevention:**
- Check platform compatibility in package metadata
- Warn about platform-specific packages
- Detect native module compilation failures early

---

### Pitfall 15: License Compliance Blindness
**What goes wrong:** Agent installs packages with restrictive licenses (AGPL, GPL) that conflict with project licensing.

**Prevention:**
- Parse package licenses before installation
- Warn on copyleft licenses in non-GPL projects
- Allow user to configure license blocklist

---

## Minor Pitfalls

### Pitfall 16: Cache Staleness
**What goes wrong:** Agent uses stale package manager cache, installs outdated versions.

**Prevention:**
- Refresh package manager cache periodically
- Use fresh resolution for critical packages
- Honor user's cache settings

---

### Pitfall 17: Registry Mirror/Proxy Ignorance
**What goes wrong:** Agent ignores configured registry mirrors (common in China, corporate networks), causing slow/failed installs.

**Prevention:**
- Respect package manager registry configuration
- Don't override user's registry settings
- Handle registry timeouts gracefully

---

### Pitfall 18: Verbose Output Flooding
**What goes wrong:** Package manager output floods console, making agent's actual work invisible.

**Prevention:**
- Suppress verbose package manager output by default
- Show progress indicators instead
- Log full output only on errors

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Ecosystem Detection | Pitfall 3 (Cross-ecosystem contamination) | Multi-signal detection, explicit confirmation |
| Package Validation | Pitfall 1 (Dependency injection) | Registry validation, typosquatting detection |
| Dependency Resolution | Pitfall 2 (Transitive explosion) | Dry-run resolution, vulnerability scanning |
| Version Management | Pitfall 4 (Version conflicts) | Parse existing constraints, conflict detection |
| Secure Installation | Pitfall 5 (Install scripts) | Disable scripts, sandbox execution |
| Orchestration | Pitfall 6 (Race conditions) | Serialized installs, batching |
| Workspace Support | Pitfall 7 (Monorepo misdetection) | Workspace config parsing, location mapping |
| Private Registries | Pitfall 8 (Auth failures) | Config reading, clear auth errors |
| Code Generation Integration | Pitfall 10 (Version drift) | Include version context in LLM prompts |
| Import Validation Extension | Pitfall 9 (Circular deps) | Import graph analysis |

---

## Confidence Assessment

**Overall Confidence: MEDIUM**

Reasoning:
- Based on training data knowledge of package manager behavior and common security issues
- Could not verify with Context7, official docs, or current WebSearch
- Pitfalls drawn from known supply chain attacks, package manager quirks, and multi-agent system challenges
- **Recommendation:** Validate critical pitfalls (1, 2, 5) with official security advisories before finalizing roadmap

**High Confidence (Training Data + Common Knowledge):**
- Pitfall 1 (Typosquatting is well-documented threat)
- Pitfall 5 (Install scripts are known attack vector)
- Pitfall 6 (Race conditions are fundamental concurrency issue)

**Medium Confidence (Logical Inference + Training Data):**
- Pitfall 2, 4, 7, 8, 10 (Common package manager issues)

**Lower Confidence (Specific to Coding Agents):**
- Pitfall 3, 9 (Less documented in coding agent context specifically)

---

## Sources

**Note:** Unable to access external verification tools (WebSearch, Context7, WebFetch). All pitfalls derived from:
- Training data on package manager security (npm, pip, Go modules)
- Known supply chain attacks (event-stream, left-pad, typosquatting)
- Package manager documentation patterns
- Multi-agent system design principles

**Recommended verification sources for roadmap planning:**
- npm security advisories: https://github.com/advisories
- OWASP Dependency Confusion: https://owasp.org/www-project-dependency-check/
- Package manager security docs: npm, pnpm, pip, Go official security guidelines
- Existing coding agent projects: Cursor, GitHub Copilot workspace, Aider security models

**Flag for Phase-Specific Research:**
- Phase 1: Research current best practices for ecosystem detection in 2026
- Phase 3: Research latest package manager security features (sandbox modes, audit tools)
- Phase 2: Research current typosquatting detection services/APIs
