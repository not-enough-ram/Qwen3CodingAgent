# Phase 2: Dependency Analysis & Safety - Research

**Researched:** 2026-02-14
**Domain:** Import analysis, package categorization, npm registry validation
**Confidence:** HIGH

## Summary

Phase 2 builds on Phase 1's package manager detection and installation infrastructure by adding intelligent dependency analysis. The research reveals that **most Phase 2 functionality is already implemented during Phase 1**, with significant gaps only in production vs dev dependency categorization (DEP-03).

The codebase already has robust import extraction (handles ES6, CommonJS, dynamic imports, scoped packages, subpath imports), npm registry validation (validatePackageExists, validatePackagesBatch with 5s timeout), and full integration with ConsentManager. The import validation loop is fully integrated into the pipeline with registry validation before consent, installation after approval, and ImportValidator rebuilding after successful installs.

**Primary recommendation:** Focus planning on DEP-03 (categorizing dependencies as production vs dev based on file path patterns) and strengthening existing edge case handling. Most Phase 2 requirements are already satisfied.

## What Phase 1 Already Delivered

### Already Implemented (HIGH Confidence)

| Feature | Status | Evidence |
|---------|--------|----------|
| Import extraction from code | ✓ COMPLETE | ImportValidator.extractImports() handles ES6, CommonJS, dynamic imports, scoped packages (@scope/pkg), subpath imports (pkg/subpath) |
| Missing package detection | ✓ COMPLETE | ImportValidator.validate() returns missingPackages array with substitution suggestions |
| npm registry validation | ✓ COMPLETE | validatePackageExists() with 5s timeout, validatePackagesBatch() for parallel validation, validatePackageName() using npm's official validation library |
| ConsentManager integration | ✓ COMPLETE | ImportValidator.validateWithConsent() flows through ConsentManager.checkBatchApproval() with metadata |
| Pipeline import validation loop | ✓ COMPLETE | Lines 179-341 in pipeline.ts: detect missing imports → validate registry → consent → install → rebuild validator → re-verify |
| ImportValidator rebuild after install | ✓ COMPLETE | Lines 261-264 in pipeline.ts: new ImportValidator created with updated dependency list after successful installation |

### What's Missing (MEDIUM-HIGH Confidence)

| Gap | Requirement | Current State | What's Needed |
|-----|-------------|---------------|---------------|
| Production vs dev categorization | DEP-03 | All packages installed as production dependencies (--save, not --save-dev) | File path pattern detection: test/, *.test.ts, *.spec.ts → devDependencies |
| Install command respects category | DEP-03 | buildInstallArgs() always uses production flags | Add devDependency parameter, use --save-dev/-D for dev packages |
| Dev-only package detection | DEP-03 | No automatic detection | Heuristic: vitest, jest, mocha, @types/*, eslint, prettier always devDependencies |

## Standard Stack

### Core (Already in Codebase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| validate-npm-package-name | ^5.0.0 | Package name format validation | Official npm validation library, handles legacy formats and scoped packages |
| node:https | builtin | Registry API HTTP requests | Native Node.js module, zero dependencies, sufficient for simple GET requests |

### NOT Needed (Don't Add)

| Library | Why Not |
|---------|---------|
| npm-registry-fetch | Overkill - codebase only needs simple existence checks, not full metadata fetching |
| axios/got/node-fetch | Already have node:https working correctly with 5s timeout |
| glob libraries | Already have regex-based import detection that works for all import styles |
| @typescript/eslint-plugin-import | Too heavy - not running full linting, just extracting import specifiers |

## Architecture Patterns

### Pattern 1: File Path-Based Dependency Categorization

**What:** Determine if a package should be devDependency or dependency based on the file importing it

**When to use:** During import validation when preparing packages for installation

**Example (Common Pattern in Ecosystem):**
```typescript
// Pattern used by npm, pnpm, yarn ecosystem
function categorizePackage(
  packageName: string,
  importingFilePath: string
): 'dev' | 'prod' {
  // Test file patterns
  const testPatterns = [
    /\.test\.(ts|js|tsx|jsx)$/,
    /\.spec\.(ts|js|tsx|jsx)$/,
    /\/__tests__\//,
    /\/test\//,
    /\/tests\//,
  ]

  if (testPatterns.some(pattern => pattern.test(importingFilePath))) {
    return 'dev'
  }

  // Known dev-only packages (heuristic)
  const devOnlyPackages = [
    'vitest', 'jest', 'mocha', 'chai', 'jasmine',
    'eslint', 'prettier', 'husky', 'lint-staged',
    'typescript', 'ts-node', 'ts-jest',
    'webpack', 'vite', 'rollup', 'esbuild',
    'nodemon', 'concurrently',
  ]

  if (devOnlyPackages.includes(packageName)) {
    return 'dev'
  }

  // @types/* always devDependencies
  if (packageName.startsWith('@types/')) {
    return 'dev'
  }

  // Default to production
  return 'prod'
}
```

### Pattern 2: Batch Categorization with Install Command Builder

**What:** Group packages by category before building install commands

**Example:**
```typescript
type CategorizedPackages = {
  production: string[]
  dev: string[]
}

function buildInstallCommand(
  pm: PackageManager,
  categorized: CategorizedPackages
): string[] {
  const commands: string[] = []

  if (categorized.production.length > 0) {
    const args = buildInstallArgs(pm, categorized.production, 'prod')
    commands.push(`${pm} ${args.join(' ')}`)
  }

  if (categorized.dev.length > 0) {
    const args = buildInstallArgs(pm, categorized.dev, 'dev')
    commands.push(`${pm} ${args.join(' ')}`)
  }

  return commands
}

function buildInstallArgs(
  pm: PackageManager,
  packages: string[],
  category: 'dev' | 'prod'
): string[] {
  switch (pm) {
    case 'npm':
      return category === 'dev'
        ? ['install', '--save-dev', ...packages]
        : ['install', '--save', ...packages]
    case 'pnpm':
      return category === 'dev'
        ? ['add', '-D', ...packages]
        : ['add', ...packages]
    case 'yarn':
      return category === 'dev'
        ? ['add', '--dev', ...packages]
        : ['add', ...packages]
  }
}
```

### Pattern 3: Import Context Tracking

**What:** Track which file imports which package to provide context for categorization

**Example:**
```typescript
type ImportContext = {
  packageName: string
  importedInFiles: string[]
}

class ImportAnalyzer {
  private contexts: Map<string, ImportContext>

  analyzeFile(filePath: string, code: string): void {
    const imports = this.extractImports(code)

    for (const pkgName of imports) {
      const existing = this.contexts.get(pkgName)
      if (existing) {
        existing.importedInFiles.push(filePath)
      } else {
        this.contexts.set(pkgName, {
          packageName: pkgName,
          importedInFiles: [filePath]
        })
      }
    }
  }

  categorize(packageName: string): 'dev' | 'prod' {
    const context = this.contexts.get(packageName)
    if (!context) return 'prod'

    // If ANY file is non-test, it's production
    const hasNonTestFile = context.importedInFiles.some(
      file => !this.isTestFile(file)
    )

    return hasNonTestFile ? 'prod' : 'dev'
  }
}
```

### Anti-Patterns to Avoid

- **Hardcoding dev package lists:** Package ecosystems evolve. Use pattern matching first (test files → dev), package name heuristics second (@types/*, known frameworks), then default to production
- **Installing production and dev in separate PM invocations:** This can cause race conditions in lock file updates. If categorization is needed, consider two separate install commands but run them sequentially
- **Assuming workspace packages are external:** Monorepo workspace packages may use workspace: protocol or link: protocol. Don't try to install these from npm registry
- **Overriding user's existing categorization:** If package.json already has a package in dependencies or devDependencies, respect that choice

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Package name validation | Custom regex for valid package names | validate-npm-package-name library (already in codebase) | Handles legacy uppercase packages, scoped packages, all npm rules |
| Import regex patterns | Complex regex for all import styles | Existing ImportValidator.extractImports() | Already handles ES6, CommonJS, dynamic, comments, scoped packages, subpaths |
| npm registry HTTP client | Full-featured HTTP client with retries | node:https with simple Promise wrapper (already in codebase) | Sufficient for existence checks, no need for complex retry/cache logic |
| Test file detection | Custom glob patterns | Simple regex array against file path | Test runners (vitest/jest/mocha) each accept different patterns; regex is universal |

**Key insight:** Phase 1 already built robust primitives. Don't rebuild what exists; enhance with categorization logic only.

## Common Pitfalls

### Pitfall 1: Subpath Import Ambiguity

**What goes wrong:** Importing 'lodash/merge' extracts package name as 'lodash', but codebase might only need that single subpath export

**Why it happens:** npm packages can export subpaths without requiring full package installation (lodash has 300+ utilities, but user may only need 1)

**How to avoid:** Current extractImports() correctly extracts package name only (not subpath). This is correct behavior - install full package, let package.json exports handle subpath resolution

**Warning signs:** User reports large package installed when they only needed one function

### Pitfall 2: Workspace Package False Positives

**What goes wrong:** Monorepo workspace packages appear as missing imports but shouldn't be installed from npm

**Why it happens:** ImportValidator checks against projectContext.dependencies, which may not include workspace packages

**How to avoid:**
- Check package.json workspaces field before categorizing as missing
- Look for workspace: protocol in dependencies (pnpm/yarn)
- Detect monorepo structure (lerna.json, pnpm-workspace.yaml)

**Warning signs:** Agent tries to install packages that already exist in workspace

### Pitfall 3: @types/* Always Dev, But Package Itself May Be Prod

**What goes wrong:** Installing @types/node as production dependency when it should always be dev

**Why it happens:** TypeScript type definitions are compile-time only, never needed at runtime

**How to avoid:** Special case all @types/* packages as devDependencies regardless of file path

**Warning signs:** package.json has @types/* in dependencies instead of devDependencies

### Pitfall 4: Test Files May Import Production Packages

**What goes wrong:** Categorizing 'express' as devDependency because it's imported in a test file

**Why it happens:** Test files often import the actual application code being tested

**How to avoid:** If package is imported in ANY non-test file, categorize as production. Only mark as dev if EXCLUSIVELY used in test files.

**Warning signs:** Production packages end up in devDependencies, breaking deployment

### Pitfall 5: Registry Validation Before Consent (Critical Security)

**What goes wrong:** User prompted to install hallucinated package name that doesn't exist

**Why it happens:** LLM can generate plausible-sounding package names that don't exist on npm

**How to avoid:** Already implemented correctly in Phase 1 - validatePackagesBatch() runs BEFORE ConsentManager prompt (pipeline.ts:209)

**Warning signs:** Users report being asked to approve non-existent packages

### Pitfall 6: Test Runner Framework Confusion

**What goes wrong:** Regex patterns match *.test.ts for vitest but miss test/**/*.js for mocha projects

**Why it happens:** Different test runners use different file conventions:
- vitest/jest: *.test.ts, *.spec.ts, __tests__/**
- mocha: test/**/*.js, spec/**/*.js
- tape: test.js, *-test.js

**How to avoid:** Use comprehensive pattern array covering all major frameworks

**Warning signs:** Test utilities installed as production dependencies

## Code Examples

Verified patterns from research and existing codebase:

### Test File Detection (Comprehensive)

```typescript
// Source: Research from vitest, jest, mocha documentation + ecosystem observation
function isTestFile(filePath: string): boolean {
  const testPatterns = [
    // vitest/jest patterns
    /\.test\.(ts|js|tsx|jsx|mts|cts|mjs|cjs)$/,
    /\.spec\.(ts|js|tsx|jsx|mts|cts|mjs|cjs)$/,
    /\/__tests__\//,

    // mocha patterns
    /\/test\//,
    /\/tests\//,
    /\/spec\//,
    /\/specs\//,

    // Common alt patterns
    /-test\.(ts|js)$/,
    /-spec\.(ts|js)$/,
    /\.test$/,
  ]

  return testPatterns.some(pattern => pattern.test(filePath))
}
```

### Package Name Extraction (Already Correct in Codebase)

```typescript
// Source: src/tools/importValidator.ts lines 110-117
// Extract package name (handle @scope/pkg and pkg/subpath)
let pkgName: string
if (specifier.startsWith('@')) {
  const parts = specifier.split('/')
  pkgName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier
} else {
  pkgName = specifier.split('/')[0] ?? specifier
}
```

### Install Args with Dev Support (Enhancement Needed)

```typescript
// Enhancement to existing src/tools/packageInstaller.ts buildInstallArgs
export function buildInstallArgs(
  pm: PackageManager,
  packages: string[],
  category: 'dev' | 'prod' = 'prod'
): string[] {
  switch (pm) {
    case 'npm':
      return category === 'dev'
        ? ['install', '--save-dev', ...packages]
        : ['install', '--save', ...packages]
    case 'pnpm':
      return category === 'dev'
        ? ['add', '-D', ...packages]
        : ['add', ...packages]
    case 'yarn':
      return category === 'dev'
        ? ['add', '--dev', ...packages]
        : ['add', ...packages]
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual package.json editing | Package manager CLI commands | Always standard | Phase 1 correctly uses PM commands, no change needed |
| Optimistic installation without validation | Registry validation before consent | Emerging best practice (2024-2026) | Phase 1 already implements this correctly |
| All dependencies as production | Categorize by usage context | Growing adoption (2025-2026) | Phase 2 gap - needs implementation |
| Separate consent per package | Batch approval with context | Modern UX pattern | Phase 1 already implements batch approval |
| --save-dev vs --save distinction | Automatic based on usage | Emerging (no tooling standard yet) | Phase 2 opportunity to innovate |

**Deprecated/outdated:**
- npm --save flag requirement: Since npm 5.0 (2017), --save is default. Still use it explicitly for clarity.
- Editing package.json directly: Bypasses lock file updates, breaks sync. Always use PM commands.

## Open Questions

1. **Workspace Package Detection**
   - What we know: Monorepos use workspace: protocol (pnpm/yarn), file: protocol (npm workspaces)
   - What's unclear: Should agent detect workspaces and exclude those packages from installation attempts?
   - Recommendation: OUT OF SCOPE for Phase 2. Covered by v2 requirement WRK-01. Document as known limitation.

2. **Mixed Categorization (Package Used in Both Test and Prod Files)**
   - What we know: If zod imported in src/user.ts and test/user.test.ts, should be production
   - What's unclear: Should we warn user about this? Just silently categorize as prod?
   - Recommendation: Silently categorize as production. This is correct behavior (tests import production code).

3. **@types/* Exception Handling**
   - What we know: @types/* should always be devDependencies
   - What's unclear: Are there edge cases where @types/* is needed in production? (No, TypeScript compiles away types)
   - Recommendation: ALWAYS categorize @types/* as dev, no exceptions.

## Sources

### Primary (HIGH confidence)

- **Codebase Analysis:**
  - src/tools/importValidator.ts - Import extraction implementation (lines 67-128)
  - src/tools/packageRegistry.ts - Registry validation implementation
  - src/orchestrator/pipeline.ts - Import validation loop (lines 179-341)
  - test/tools/importValidator.test.ts - Comprehensive test coverage for edge cases
  - .planning/phases/01-ecosystem-detection/01-VERIFICATION.md - Phase 1 completion proof

- **npm Official Documentation:**
  - [npm Package Metadata Response](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md) - Registry API response format
  - [npm Registry API Docs](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md) - Official API specification
  - [npm Dependencies vs devDependencies](https://docs.npmjs.com/specifying-dependencies-and-devdependencies-in-a-package-json-file/) - Official categorization guidance

- **Node.js Official Documentation:**
  - [Node.js Package Exports](https://nodejs.org/api/packages.html) - Package.json exports field and subpath patterns
  - [Node.js ESM Documentation](https://nodejs.org/api/esm.html) - Import resolution algorithm

### Secondary (MEDIUM confidence)

- [Understanding Dependencies vs devDependencies (2026)](https://oneuptime.com/blog/post/2026-01-22-nodejs-dependencies-vs-devdependencies/view) - Current best practices for categorization
- [npm Registry API Guide](https://www.edoardoscibona.com/exploring-the-npm-registry-api) - Practical usage patterns
- [Is this a dependency or devDependency?](https://withblue.ink/2020/06/07/is-this-a-dependency-or-devdependency.html) - Decision framework
- [TypeScript Monorepo with Workspaces](https://nesbitt.io/2026/01/18/workspaces-and-monorepos-in-package-managers.html) - Workspace package handling
- [--save-dev Flag Guide](https://www.dhiwise.com/blog/design-converter/npm-save-flag-guide-best-practices-for-developers) - Flag usage patterns
- [Vitest Configuration](https://vitest.dev/guide/projects) - Test file patterns

### Tertiary (LOW confidence - marked for validation)

- Community discussions on test file patterns (varies by project)
- Heuristic dev package lists (consensus-based, no official source)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Existing implementation is correct, no new libraries needed
- Architecture: MEDIUM-HIGH - Categorization patterns researched from ecosystem, not official standard
- Pitfalls: HIGH - Based on codebase analysis and verified with official docs
- Gap analysis: HIGH - Compared requirements against verified Phase 1 implementation

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days - stable domain, slow-moving standards)

**Key Finding:** Phase 1 over-delivered on Phase 2 requirements. Most work is enhancement of existing primitives, not new infrastructure.
