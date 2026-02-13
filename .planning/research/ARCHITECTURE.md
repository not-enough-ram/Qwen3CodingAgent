# Architecture Patterns: Dependency Management in Multi-Agent Coding Pipeline

**Domain:** Multi-agent coding assistant with automatic dependency management
**Researched:** 2026-02-13
**Confidence:** HIGH (based on codebase analysis and architectural patterns)

## Executive Summary

Automatic dependency management in a multi-agent coding pipeline requires careful integration at multiple points. The key architectural decision is WHERE dependency resolution happens: before code generation (proactive) or after (reactive). Based on analysis of the existing QwenCodingAgent pipeline, a **hybrid reactive-then-proactive** approach is recommended, where dependency detection happens post-generation but before the next task begins, enabling the next task to benefit from installed dependencies.

## Recommended Architecture

### High-Level Integration Points

```
User Request
    │
    ▼
┌─────────────┐
│  Planner    │ → Task List
└─────────────┘
    │
    ▼ (for each task)
┌─────────────┐
│ Architect   │ → File Plan
└─────────────┘
    │
    ▼
┌─────────────┐
│   Coder     │ → Code Changes
└─────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  Import Validator                │ → Missing packages detected
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  Dependency Resolver (NEW)       │ → Package ecosystem + versions
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  Consent Manager (existing)      │ → User approval
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  Package Manager Executor (NEW)  │ → Install packages + update manifests
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  Dependency Context Builder      │ → Updated context for next iteration
└──────────────────────────────────┘
    │
    ▼
┌─────────────┐
│  Reviewer   │ → Pass? ──yes──→ Apply Changes → Next Task
└─────────────┘           │
                         no
                          │
                          ▼
                    Coder (retry with feedback)
```

### Component Boundaries

| Component | Responsibility | Input | Output | Communicates With |
|-----------|---------------|-------|--------|-------------------|
| **ImportValidator** (existing) | Extract imports from code, identify missing packages | Code content, allowed packages | Missing packages list, suggested alternatives | DependencyContext, ConsentManager |
| **EcosystemDetector** (NEW) | Detect project type and package ecosystems | Project files (package.json, requirements.txt, go.mod, etc.) | Ecosystem type (npm/pnpm/yarn, pip/poetry, cargo, etc.) | DependencyResolver |
| **DependencyResolver** (NEW) | Resolve package names to installation targets with versions | Missing package names, ecosystem type | Resolved packages with versions, install commands | EcosystemDetector, PackageRegistry APIs |
| **ConsentManager** (existing) | Get user approval for package installations | Package list, alternatives | Approved packages, rejected packages | ImportValidator, PackageManagerExecutor |
| **PackageManagerExecutor** (NEW) | Execute package manager commands, update manifest files | Approved packages, ecosystem type, install commands | Success/failure, updated manifests | ToolKit, ConsentManager |
| **DependencyContext** (existing) | Build context of available dependencies for prompt injection | Installed packages from package.json | Formatted dependency constraints | ToolKit |
| **ToolKit** (existing) | Safe file I/O and command execution | File paths, commands | File content, command results | All components |

## Data Flow

### Reactive Detection Flow (After Code Generation)

```
1. Coder generates code with imports
   ↓
2. ImportValidator extracts imports → detects missing packages
   ↓
3. EcosystemDetector identifies project type (Node.js/Python/etc.)
   ↓
4. DependencyResolver maps package names to ecosystem packages
   ↓
5. ConsentManager prompts user for approval
   ↓
6. PackageManagerExecutor installs approved packages
   ↓
7. DependencyContext rebuilds (for next task or retry)
   ↓
8. If packages installed → Reviewer validates
   If packages rejected → Coder retries without them (current behavior)
```

### Proactive Context Flow (For Subsequent Tasks)

```
1. Task N completes with new dependencies installed
   ↓
2. DependencyContext rebuilds with updated package.json
   ↓
3. Task N+1 Coder receives updated dependency context
   ↓
4. Coder can now use newly installed packages
```

## Detailed Component Design

### 1. EcosystemDetector

**Purpose:** Detect package manager and ecosystem from project files.

**Detection Strategy:**

```typescript
type Ecosystem = {
  type: 'node' | 'python' | 'rust' | 'go' | 'ruby' | 'unknown'
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'pip' | 'poetry' | 'cargo' | 'go' | 'bundler'
  manifestFile: string
  lockFile?: string
}

class EcosystemDetector {
  detect(tools: ToolKit): Ecosystem {
    // Priority order for Node.js
    if (tools.fileExists('pnpm-lock.yaml')) return { type: 'node', packageManager: 'pnpm', ... }
    if (tools.fileExists('yarn.lock')) return { type: 'node', packageManager: 'yarn', ... }
    if (tools.fileExists('package-lock.json')) return { type: 'node', packageManager: 'npm', ... }
    if (tools.fileExists('package.json')) return { type: 'node', packageManager: 'npm', ... }

    // Python
    if (tools.fileExists('poetry.lock')) return { type: 'python', packageManager: 'poetry', ... }
    if (tools.fileExists('requirements.txt')) return { type: 'python', packageManager: 'pip', ... }

    // Rust
    if (tools.fileExists('Cargo.toml')) return { type: 'rust', packageManager: 'cargo', ... }

    // Go
    if (tools.fileExists('go.mod')) return { type: 'go', packageManager: 'go', ... }

    return { type: 'unknown', packageManager: null, ... }
  }
}
```

**Design Pattern:** Strategy pattern for ecosystem-specific logic.

### 2. DependencyResolver

**Purpose:** Map generic package names to ecosystem-specific packages with version resolution.

**Key Challenges:**
- Package names may differ across ecosystems (e.g., `chalk` in Node.js doesn't exist in Python)
- Version compatibility needs to be resolved
- Registry lookups may fail or timeout

**Resolution Strategy:**

```typescript
type ResolvedPackage = {
  name: string
  version: string | 'latest'
  installTarget: string  // e.g., "package@^1.0.0" or "package"
  source: 'registry' | 'inference' | 'fallback'
}

class DependencyResolver {
  async resolve(
    packages: string[],
    ecosystem: Ecosystem
  ): Promise<Result<ResolvedPackage[], Error>> {
    // For Node.js ecosystem
    if (ecosystem.type === 'node') {
      return await this.resolveNodePackages(packages)
    }
    // ... other ecosystems
  }

  private async resolveNodePackages(packages: string[]): Promise<...> {
    // 1. Try npm registry API for each package
    // 2. Get latest stable version
    // 3. Handle scoped packages (@scope/package)
    // 4. Fallback to 'latest' tag if API fails
  }
}
```

**Versioning Philosophy:**
- **Default:** Use `latest` for new dependencies (simplest, most common)
- **Future enhancement:** Parse existing package.json for version range patterns and match style

**Registry Integration:**
- Node.js: `https://registry.npmjs.org/{package}` (no auth required for public packages)
- Python: `https://pypi.org/pypi/{package}/json`
- Fallback: Install without version specifier, let package manager resolve

### 3. PackageManagerExecutor

**Purpose:** Execute installation commands and update manifest files safely.

**Execution Flow:**

```typescript
class PackageManagerExecutor {
  async install(
    packages: ResolvedPackage[],
    ecosystem: Ecosystem,
    tools: ToolKit
  ): Promise<Result<InstallResult, Error>> {
    // 1. Validate ecosystem is supported
    // 2. Build install command
    const command = this.buildInstallCommand(packages, ecosystem)

    // 3. Execute via ToolKit.runCommand (which enforces allowlist)
    const result = tools.runCommand(command.cmd, command.args)

    // 4. If successful, verify package.json was updated
    // 5. Return updated dependency list
  }

  private buildInstallCommand(packages: ResolvedPackage[], ecosystem: Ecosystem) {
    if (ecosystem.packageManager === 'pnpm') {
      return {
        cmd: 'pnpm',
        args: ['add', ...packages.map(p => p.installTarget)]
      }
    }
    // ... other package managers
  }
}
```

**Safety Considerations:**
- All commands go through ToolKit's `runCommand`, which enforces ALLOWED_COMMANDS whitelist
- No shell expansion or injection possible (validated in ToolKit)
- Timeout enforcement (60s per command)
- Working directory scoped to project root

**Manifest Update Strategy:**
- **Primary:** Let package manager update manifest (npm/pnpm/yarn do this automatically)
- **Verification:** Read package.json after install to confirm update
- **Fallback:** If package manager fails to update manifest, manual JSON modification (risky, avoid if possible)

### 4. Integration with Existing Pipeline

**Current Import Validation Loop (pipeline.ts lines 160-223):**

```typescript
// CURRENT: Retry loop with import validation feedback
for (let importAttempt = 0; importAttempt < maxImportRetries; importAttempt++) {
  const validation = await importValidator.validateWithConsent(code, consentManager)

  if (!validation.valid) {
    // Tell coder to rewrite without rejected packages
    codeResult = await coderAgent({
      ...coderInput,
      importValidationFeedback: buildRejectionFeedback(validation.rejectedPackages)
    })
  }
}
```

**NEW: Dependency Resolution Integration:**

```typescript
// ENHANCED: Resolve and install, then retry or proceed
for (let importAttempt = 0; importAttempt < maxImportRetries; importAttempt++) {
  const validation = await importValidator.validateWithConsent(code, consentManager)

  if (!validation.valid && validation.approvedPackages.length > 0) {
    // 1. Detect ecosystem
    const ecosystem = ecosystemDetector.detect(tools)

    // 2. Resolve packages
    const resolved = await dependencyResolver.resolve(validation.approvedPackages, ecosystem)

    // 3. Install packages
    const installed = await packageManagerExecutor.install(resolved, ecosystem, tools)

    if (installed.ok) {
      // 4. Rebuild dependency context
      dependencyContext = buildDependencyContext(tools)

      // 5. Update import validator's allowed packages
      importValidator = new ImportValidator(installed.value.dependencies, installed.value.devDependencies)

      // 6. Re-validate code (should pass now)
      // No retry needed - packages are now available
      break
    } else {
      // Installation failed - fall back to rejection feedback
      codeResult = await coderAgent({
        ...coderInput,
        importValidationFeedback: buildInstallationFailureFeedback(installed.error)
      })
    }
  } else if (!validation.valid && validation.rejectedPackages.length > 0) {
    // User rejected packages - use current behavior (tell coder to rewrite)
    codeResult = await coderAgent({
      ...coderInput,
      importValidationFeedback: buildRejectionFeedback(validation.rejectedPackages)
    })
  }
}
```

## Architectural Patterns

### Pattern 1: Layered Dependency Resolution

**What:** Separate detection, resolution, and execution into distinct layers.

**Why:**
- Each layer can be tested independently
- Ecosystem-specific logic is isolated
- Easy to add new ecosystems without modifying core pipeline

**Example:**
```typescript
// Layer 1: Detection
const ecosystem = ecosystemDetector.detect(tools)

// Layer 2: Resolution
const resolved = await dependencyResolver.resolve(packages, ecosystem)

// Layer 3: Execution
const result = await packageManagerExecutor.install(resolved, ecosystem, tools)
```

### Pattern 2: Consent-Driven Installation

**What:** All package installations require explicit user consent at session or project scope.

**Why:**
- Security: Prevent arbitrary package installation
- Transparency: User sees what's being installed
- Control: User can reject packages and force alternative implementation

**Example:**
```typescript
// ConsentManager already implements this pattern
const approved = await consentManager.checkBatchApproval(packages, {
  suggestedAlternatives: ['Use node:crypto instead of uuid']
})

// Only install approved packages
await executor.install(approved, ecosystem, tools)
```

### Pattern 3: Fallback Chain for Version Resolution

**What:** Try multiple strategies to determine package version, from most to least reliable.

**Why:**
- Registry APIs may be unavailable or rate-limited
- Some projects may not be in public registries
- Degraded functionality is better than total failure

**Example:**
```typescript
async resolveVersion(pkg: string, ecosystem: Ecosystem): Promise<string> {
  // 1. Try registry API
  const registryVersion = await this.fetchFromRegistry(pkg, ecosystem)
  if (registryVersion.ok) return registryVersion.value

  // 2. Check existing package.json for version hints
  const hintedVersion = this.inferFromManifest(pkg, tools)
  if (hintedVersion) return hintedVersion

  // 3. Fallback to 'latest'
  return 'latest'
}
```

### Pattern 4: Idempotent Installation

**What:** Installing the same package multiple times should be safe and cheap.

**Why:**
- Multiple tasks may request the same dependency
- Retries may occur after partial failures
- Simplifies error recovery

**Example:**
```typescript
async install(packages: ResolvedPackage[], ...): Promise<...> {
  // Filter out already-installed packages
  const toInstall = packages.filter(pkg => !this.isInstalled(pkg, tools))

  if (toInstall.length === 0) {
    return ok({ alreadyInstalled: true, dependencies: [...] })
  }

  // Only install what's needed
  return await this.executeInstall(toInstall, ...)
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Pre-emptive Package Installation

**What:** Installing packages before code is generated based on task description.

**Why bad:**
- LLM may not actually use the package (hallucination or changed approach)
- Installs unnecessary dependencies
- Harder to get accurate consent (no concrete code to review)

**Instead:** React to actual imports in generated code.

### Anti-Pattern 2: Automatic Manifest Manipulation

**What:** Directly editing package.json/requirements.txt without using package manager.

**Why bad:**
- Lock files get out of sync
- Version resolution happens client-side (duplicates package manager logic)
- Breaks integrity checks
- Different manifest formats (YAML, TOML, JSON) increase complexity

**Instead:** Always use package manager commands (npm install, pip install, etc.) which update manifests atomically.

### Anti-Pattern 3: Silent Installation

**What:** Installing packages without user awareness or consent.

**Why bad:**
- Security risk (supply chain attacks)
- User loses control
- Unexpected side effects (post-install scripts)

**Instead:** Always use ConsentManager for approval, show what's being installed.

### Anti-Pattern 4: Global Installation

**What:** Installing packages globally instead of project-locally.

**Why bad:**
- Pollutes global namespace
- Version conflicts across projects
- Not reflected in project manifest
- Hard to reproduce environment

**Instead:** Always install to project scope (default for npm/pnpm/pip).

### Anti-Pattern 5: Installing from Generic Import Names

**What:** Importing `database` and trying to install a package called `database`.

**Why bad:**
- Many imports are not package names (e.g., local modules)
- Generic names may not map to actual packages
- Could install wrong/malicious package

**Instead:** Only resolve packages that fail ImportValidator AND are confirmed external packages (not local modules, not builtins).

## Suggested Build Order

### Phase 1: Foundation (Ecosystem Detection)
**Dependencies:** None
**Deliverables:**
- EcosystemDetector with support for Node.js (npm/pnpm/yarn)
- Tests for detection logic
- Integration with ToolKit

**Why first:** Simplest component, no external dependencies, required by all others.

### Phase 2: Package Resolution
**Dependencies:** Phase 1
**Deliverables:**
- DependencyResolver for Node.js packages
- npm registry API integration
- Version resolution with fallback chain
- Tests for resolution logic

**Why second:** Can be developed and tested independently with mock ecosystem data.

### Phase 3: Installation Execution
**Dependencies:** Phase 1, Phase 2
**Deliverables:**
- PackageManagerExecutor for npm/pnpm/yarn
- Command building logic
- Manifest verification
- Tests with mock ToolKit

**Why third:** Requires resolver output, but can be tested without full pipeline integration.

### Phase 4: Pipeline Integration
**Dependencies:** Phase 1, 2, 3
**Deliverables:**
- Modified pipeline.ts import validation loop
- DependencyContext rebuilding
- Error handling and retry logic
- Integration tests

**Why fourth:** Brings everything together, requires all components working.

### Phase 5: Multi-Ecosystem Support
**Dependencies:** All previous phases
**Deliverables:**
- Python ecosystem support (pip/poetry)
- Rust ecosystem support (cargo)
- Go ecosystem support (go get/go mod)
- Ecosystem-specific tests

**Why last:** Extends proven architecture to new ecosystems, non-blocking for initial value.

## Scalability Considerations

| Concern | At 10 packages | At 100 packages | At 1000 packages |
|---------|---------------|-----------------|------------------|
| **Registry API calls** | Direct sequential calls | Batch requests, 10 concurrent max | Add caching layer, 100ms debounce |
| **Installation time** | Sequential install per package | Batch install (single command with multiple packages) | Same (package manager handles parallelization) |
| **Consent prompts** | Individual prompts acceptable | Batch approval UI needed | Same (batch already covers this) |
| **Manifest size** | No issue | No issue | No issue (package managers handle this) |
| **Lock file conflicts** | No issue | Potential with concurrent installs | Serialize installations within same task |

## Edge Cases and Error Handling

### Edge Case 1: Package Name Ambiguity

**Scenario:** Import `crypto` could be Node.js builtin or npm package.

**Solution:** ImportValidator already filters builtins (lines 106-122). Only external packages reach DependencyResolver.

### Edge Case 2: Installation Timeout

**Scenario:** `npm install` hangs or takes >60s.

**Solution:** ToolKit enforces 60s timeout (line 202). Return error, let user retry or reject package.

### Edge Case 3: Version Conflicts

**Scenario:** Installing package A requires version 1.x of dependency B, but package C requires version 2.x.

**Solution:** Let package manager resolve (npm/pnpm handle peer dependencies). If install fails, surface error to user with rejection feedback to coder.

### Edge Case 4: Private/Scoped Packages

**Scenario:** Import `@mycompany/internal-lib` that requires authentication.

**Solution:**
- Registry lookup will fail (401/404)
- Fallback to 'latest' version specifier
- If install fails, package manager will prompt for credentials (if interactive) or fail
- Failure triggers rejection feedback to coder

### Edge Case 5: Monorepo/Workspace Context

**Scenario:** Project uses pnpm workspace, packages may be internal workspace packages.

**Solution:**
- ImportValidator should include workspace packages in allowedPackages
- Requires parsing workspace manifest (pnpm-workspace.yaml, package.json workspaces field)
- **Future enhancement:** Not critical for Phase 1

## Testing Strategy

### Unit Tests

```typescript
describe('EcosystemDetector', () => {
  it('detects pnpm from pnpm-lock.yaml', ...)
  it('falls back to npm if only package.json exists', ...)
  it('returns unknown for non-Node.js projects', ...)
})

describe('DependencyResolver', () => {
  it('resolves package with version from registry', ...)
  it('falls back to latest if registry unavailable', ...)
  it('handles scoped packages correctly', ...)
})

describe('PackageManagerExecutor', () => {
  it('builds correct pnpm install command', ...)
  it('verifies manifest update after install', ...)
  it('handles install failures gracefully', ...)
})
```

### Integration Tests

```typescript
describe('Pipeline with dependency management', () => {
  it('installs missing package when user approves', ...)
  it('rejects package and retries coder when user rejects', ...)
  it('rebuilds dependency context after installation', ...)
  it('next task sees newly installed packages', ...)
})
```

### Manual Testing Scenarios

1. **Happy path:** Generate code with new package, approve, verify installation
2. **Rejection path:** Generate code with package, reject, verify coder rewrites without it
3. **Mixed approval:** Multiple packages, approve some, reject others
4. **Installation failure:** Simulate network failure, verify error handling
5. **Multi-task dependency:** Task 1 installs package, Task 2 uses it

## Component Interaction Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                        Pipeline (Orchestrator)                  │
│  - Controls execution flow                                      │
│  - Manages retry loops                                          │
│  - Coordinates all components                                   │
└────────────────────────────────────────────────────────────────┘
                              │
                              │ coordinates
                              ▼
        ┌─────────────────────────────────────────────┐
        │                                             │
        │                                             │
┌───────▼─────────┐  ┌─────────────────┐  ┌──────────▼──────────┐
│ ImportValidator │  │ ConsentManager  │  │  DependencyContext  │
│  (existing)     │  │   (existing)    │  │     (existing)      │
└───────┬─────────┘  └────────┬────────┘  └──────────┬──────────┘
        │                     │                       │
        │ missing packages    │ approval needed       │ context data
        ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NEW Components                              │
├─────────────────────────────────────────────────────────────────┤
│  EcosystemDetector → DependencyResolver → PackageManagerExecutor│
│  (what ecosystem?)   (what version?)      (install it!)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ all components use
                              ▼
                    ┌──────────────────┐
                    │     ToolKit      │
                    │   (existing)     │
                    │ - File I/O       │
                    │ - Command exec   │
                    └──────────────────┘
```

## File Structure Changes

```
src/tools/
├── importValidator.ts (existing - minor changes)
├── dependencyContext.ts (existing - minor changes)
├── toolkit.ts (existing - no changes)
├── ecosystem.ts (NEW)
│   └── EcosystemDetector class
├── resolver.ts (NEW)
│   └── DependencyResolver class
└── packageManager.ts (NEW)
    └── PackageManagerExecutor class

src/orchestrator/
└── pipeline.ts (existing - major changes to import validation loop)

test/tools/
├── ecosystem.test.ts (NEW)
├── resolver.test.ts (NEW)
└── packageManager.test.ts (NEW)

test/integration/
└── dependency-installation.integration.test.ts (NEW)
```

## Configuration

### New Config Options

```json
{
  "pipeline": {
    "enableDependencyInstallation": true,
    "maxImportRetries": 3,
    "packageInstallTimeout": 60000,
    "registryApiTimeout": 5000
  },
  "dependencies": {
    "allowedEcosystems": ["node", "python", "rust"],
    "registryUrls": {
      "npm": "https://registry.npmjs.org",
      "pypi": "https://pypi.org/pypi"
    },
    "preferredVersionStrategy": "latest"
  }
}
```

## Summary

The architecture for automatic dependency management integrates cleanly into the existing multi-agent pipeline by:

1. **Reusing existing components:** ImportValidator, ConsentManager, ToolKit, DependencyContext
2. **Adding three new components:** EcosystemDetector, DependencyResolver, PackageManagerExecutor
3. **Modifying one orchestration point:** Pipeline's import validation loop (lines 160-223)
4. **Preserving existing behavior:** If user rejects packages, coder still retries without them
5. **Enabling progressive enhancement:** Each ecosystem can be added incrementally

The recommended build order prioritizes Node.js ecosystem (most common for this codebase) and establishes patterns that extend cleanly to other ecosystems.

**Key architectural principles:**
- **Reactive not proactive:** Detect dependencies from actual code, not predictions
- **Layered separation:** Detection → Resolution → Execution
- **Consent-driven:** User approval required for all installations
- **Idempotent operations:** Safe to retry, safe to re-install
- **Package manager as source of truth:** Never bypass package manager for manifest updates

## Sources

**HIGH Confidence Sources:**
- Codebase analysis: `/home/reset/Coding/QwenCodingAgent/src/orchestrator/pipeline.ts`
- Codebase analysis: `/home/reset/Coding/QwenCodingAgent/src/tools/importValidator.ts`
- Codebase analysis: `/home/reset/Coding/QwenCodingAgent/src/consent/manager.ts`
- Codebase analysis: `/home/reset/Coding/QwenCodingAgent/src/tools/toolkit.ts`
- Codebase analysis: `/home/reset/Coding/QwenCodingAgent/src/tools/dependencyContext.ts`

**MEDIUM Confidence (Architectural patterns):**
- Package manager conventions (npm/pnpm/yarn/pip/cargo standard behaviors)
- Registry API patterns (npmjs.org, pypi.org public APIs)
- Dependency resolution patterns (commonplace in build tools)

**Note:** Limited ability to search external sources due to permission restrictions. Architecture recommendations are based on:
1. Deep analysis of existing codebase structure
2. Established patterns from package manager ecosystems
3. Security best practices for dependency management
