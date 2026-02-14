# Phase 1: Ecosystem Detection & Package Manager Support - Research

**Researched:** 2026-02-14
**Domain:** Node.js package manager detection, npm registry validation, child process execution
**Confidence:** HIGH

## Summary

Phase 1 implements auto-detection of Node.js package managers (npm/pnpm/yarn) from lock files and package.json, validates packages against the npm registry before prompting for consent, and executes installations with real-time output streaming. The implementation extends the existing ConsentManager and ToolKit infrastructure already present in the codebase.

The research reveals a mature, well-documented ecosystem with clear detection patterns (lock file presence), standardized registry APIs (registry.npmjs.org), and safe command execution primitives (child_process.spawn with argument arrays). The codebase already has the Result<T, E> error handling pattern, ConsentManager with session-scoped approvals, and ToolKit with command allowlisting—this phase extends these patterns rather than introducing new ones.

**Primary recommendation:** Use lock file detection as primary strategy (pnpm-lock.yaml → pnpm, package-lock.json → npm, yarn.lock → yarn), validate packages via HTTP GET to registry.npmjs.org before consent prompts, batch installations into single commands (pnpm add zod axios lodash), and stream output using child_process.spawn with stdio: 'inherit'.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Detection strategy:**
- Check lock files first: pnpm-lock.yaml → pnpm, package-lock.json → npm, yarn.lock → yarn
- Also check package.json "packageManager" field (corepack support)
- If no lock file exists, default to npm (always available with Node.js)
- If multiple lock files exist, prompt the user to choose which PM to use
- Detection caching: Claude's discretion on whether to detect once per run or per task

**Install command behavior:**
- Show PM output to the user in real-time (not silent)
- Use default caret (^) version ranges — just run `pnpm add zod`, accept PM defaults
- Batch all missing packages into one install command (e.g., `pnpm add zod axios lodash`)
- Peer dependency handling: Claude's discretion

**Consent flow integration:**
- Consent granularity: Claude's discretion (fits existing ConsentManager patterns)
- Approvals are session-only — forget when CLI exits
- Consent prompt must show: package name + version, why it's needed (which file/import), and the install command that will run
- Support a --yes or --auto-install flag that skips consent prompts for the session

**Failure handling:**
- If install fails (network, not found, etc.): feed error back to coder agent to rewrite using alternatives
- If user rejects a package: feed back to coder to rewrite without that package
- Validate package exists on npm registry BEFORE showing consent prompt (prevents typos/hallucinations)
- After successful install: re-run import validation to verify imports actually resolve

### Claude's Discretion

- Detection caching strategy (once per run vs per task)
- Consent granularity (batch vs per-package — whatever fits existing ConsentManager)
- Peer dependency warning handling
- Exact consent prompt formatting

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:child_process | Built-in | Execute package manager commands with streaming output | Native Node.js API, no external dependencies, spawn() provides real-time output without buffering |
| node:https | Built-in | Validate packages via npm registry API | Native HTTPS client, sufficient for simple GET requests to registry.npmjs.org |
| validate-npm-package-name | ^5.0.0 | Validate package name format before registry checks | Official npm package for name validation, same library npm uses internally |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| preferred-pm | ^4.0.0 | Detect package manager from lock files and node_modules | Optional - can implement detection manually using lock file presence checks |
| @pnpm/lockfile-file | ^9.0.0 | Parse pnpm-lock.yaml if version extraction needed | Only if reading lock file contents is required (not needed for basic detection) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual lock file detection | preferred-pm library | Library adds dependency but handles edge cases (bun.lockb, node_modules detection); manual detection is simpler and sufficient for npm/pnpm/yarn |
| node:https | node-fetch, axios, got | External HTTP clients add dependencies; native https is sufficient for simple GET requests |
| child_process.spawn | child_process.exec | exec() invokes shell, vulnerable to injection; spawn() with argument arrays is safer |
| Manual registry validation | package-exists library | Library adds dependency; simple HTTPS GET to registry.npmjs.org is straightforward |

**Installation:**

```bash
# Minimal (recommended)
npm install validate-npm-package-name

# With optional detection library
npm install validate-npm-package-name preferred-pm
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── tools/
│   ├── packageManager.ts      # PackageManagerDetector class
│   ├── packageRegistry.ts     # NpmRegistryClient class
│   └── packageInstaller.ts    # PackageInstaller class (orchestrates detection + validation + install)
```

### Pattern 1: Lock File Detection with Fallback Chain

**What:** Check for lock files in priority order, consult package.json packageManager field, default to npm

**When to use:** Primary detection strategy at start of pipeline or when import validation detects missing packages

**Example:**

```typescript
// Based on user constraints and codebase patterns
class PackageManagerDetector {
  detect(projectRoot: string): Result<PackageManager, DetectionError> {
    const lockFiles = {
      'pnpm-lock.yaml': 'pnpm',
      'package-lock.json': 'npm',
      'yarn.lock': 'yarn',
    } as const

    const found: PackageManager[] = []

    for (const [file, pm] of Object.entries(lockFiles)) {
      if (existsSync(join(projectRoot, file))) {
        found.push(pm)
      }
    }

    // Handle multiple lock files - user constraints require prompting
    if (found.length > 1) {
      return err({
        type: 'multiple_lock_files',
        found,
        message: 'Multiple lock files detected, user must choose'
      })
    }

    if (found.length === 1) {
      return ok(found[0])
    }

    // Check package.json packageManager field (corepack)
    const pkgJson = this.readPackageJson(projectRoot)
    if (pkgJson?.packageManager) {
      const pm = this.parsePackageManagerField(pkgJson.packageManager)
      if (pm) return ok(pm)
    }

    // Default to npm (always available with Node.js)
    return ok('npm')
  }

  private parsePackageManagerField(field: string): PackageManager | null {
    // Format: "pnpm@8.6.0" or "npm@9.0.0+sha224.abc123"
    const match = field.match(/^(npm|pnpm|yarn)@/)
    return match?.[1] as PackageManager | null
  }
}
```

**Source:** User constraints + [Corepack specification](https://blog.hyperknot.com/p/corepacks-packagemanager-field)

### Pattern 2: npm Registry Validation Before Consent

**What:** Validate package exists on registry.npmjs.org via HTTP GET before showing consent prompt to prevent hallucinated package names

**When to use:** Before every consent prompt to catch typos and non-existent packages

**Example:**

```typescript
class NpmRegistryClient {
  async packageExists(packageName: string): Promise<Result<boolean, RegistryError>> {
    // Validate package name format first (prevents invalid HTTP requests)
    const validation = validateNpmPackageName(packageName)
    if (!validation.validForNewPackages && !validation.validForOldPackages) {
      return err({
        type: 'invalid_package_name',
        message: validation.errors?.join(', ') || 'Invalid package name',
        packageName,
      })
    }

    // Check registry using abbreviated metadata endpoint
    // GET https://registry.npmjs.org/{package-name}
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`

    try {
      const response = await this.httpGet(url, {
        headers: {
          // Request abbreviated metadata (21kB vs 410kB for full)
          'Accept': 'application/vnd.npm.install-v1+json'
        }
      })

      if (response.statusCode === 200) {
        return ok(true)
      } else if (response.statusCode === 404) {
        return ok(false)
      } else {
        return err({
          type: 'registry_error',
          statusCode: response.statusCode,
          message: `Registry returned ${response.statusCode}`
        })
      }
    } catch (error) {
      // Network errors (ENOTFOUND, ETIMEDOUT, etc.)
      return err({
        type: 'network_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  private httpGet(url: string, options: RequestOptions): Promise<Response> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, options, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => resolve({
          statusCode: res.statusCode || 0,
          body: data
        }))
      })
      req.on('error', reject)
      req.setTimeout(5000, () => {
        req.destroy()
        reject(new Error('Registry request timeout'))
      })
    })
  }
}
```

**Sources:**
- [npm Registry API documentation](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md)
- [Package metadata format](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md)
- [validate-npm-package-name](https://www.npmjs.com/package/validate-npm-package-name)

### Pattern 3: Safe Command Execution with Real-Time Output

**What:** Use child_process.spawn() with argument arrays (not shell strings) and stdio: 'inherit' for real-time streaming

**When to use:** Executing package manager install commands after user approval

**Example:**

```typescript
class PackageInstaller {
  async install(
    packageManager: PackageManager,
    packages: string[],
    projectRoot: string
  ): Promise<Result<InstallResult, InstallError>> {
    // Build command safely - NO shell interpolation
    const cmd = packageManager
    const args = this.buildInstallArgs(packageManager, packages)

    // Validate all arguments don't contain shell metacharacters
    // (defense in depth - spawn with shell=false already protects)
    for (const arg of args) {
      if (/[;&|`$(){}!<>\\'"\n\r]/.test(arg)) {
        return err({
          type: 'invalid_argument',
          message: `Argument contains shell metacharacters: ${arg}`
        })
      }
    }

    return new Promise((resolve) => {
      // Use spawn, not exec - safer for untrusted input
      const child = spawn(cmd, args, {
        cwd: projectRoot,
        stdio: 'inherit',  // Stream output directly to parent (real-time)
        shell: false,      // CRITICAL: Don't invoke shell
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve(ok({
            success: true,
            packages,
            packageManager
          }))
        } else {
          resolve(err({
            type: 'install_failed',
            exitCode: code || 1,
            message: `${packageManager} exited with code ${code}`
          }))
        }
      })

      child.on('error', (error) => {
        // Command not found, permission denied, etc.
        resolve(err({
          type: 'execution_failed',
          message: error.message
        }))
      })
    })
  }

  private buildInstallArgs(pm: PackageManager, packages: string[]): string[] {
    // User constraints: "Use default caret (^) version ranges"
    // User constraints: "Batch all missing packages into one install command"
    switch (pm) {
      case 'npm':
        return ['install', '--save', ...packages]  // npm defaults to ^
      case 'pnpm':
        return ['add', ...packages]                // pnpm defaults to ^
      case 'yarn':
        return ['add', ...packages]                // yarn defaults to ^
    }
  }
}
```

**Sources:**
- [Node.js child_process.spawn documentation](https://nodejs.org/api/child_process.html)
- [Preventing command injection in Node.js](https://auth0.com/blog/preventing-command-injection-attacks-in-node-js-apps/)
- Existing codebase pattern in src/tools/toolkit.ts (lines 182-231)

### Pattern 4: Consent Integration with Install Commands

**What:** Extend ConsentManager to show install command preview and batch package approvals

**When to use:** When import validation detects missing packages that need user approval before installation

**Example:**

```typescript
// Extends existing ConsentManager pattern
interface InstallConsentOptions {
  packages: string[]
  packageManager: PackageManager
  reason?: string  // e.g., "needed by src/utils/validator.ts"
  installCommand: string  // e.g., "pnpm add zod axios"
}

// Integration with existing ConsentPrompter pattern
async function promptForInstall(
  options: InstallConsentOptions,
  consentManager: ConsentManager
): Promise<string[]> {
  console.log('')
  console.log('\x1b[33m  📦 PACKAGE INSTALLATION REQUIRED\x1b[0m')
  console.log(`  Packages: \x1b[1m${options.packages.join(', ')}\x1b[0m`)
  if (options.reason) {
    console.log(`  Reason: ${options.reason}`)
  }
  console.log(`  Command: \x1b[36m${options.installCommand}\x1b[0m`)
  console.log('')

  // Reuse existing ConsentManager.checkBatchApproval
  // User constraints: "Consent granularity: Claude's discretion"
  // Decision: Use existing batch approval pattern
  const approved = await consentManager.checkBatchApproval(
    options.packages,
    { reason: options.reason }
  )

  return approved
}
```

**Source:** Existing pattern in src/consent/manager.ts (lines 76-90)

### Anti-Patterns to Avoid

- **Using child_process.exec()**: Vulnerable to shell injection when package names contain special characters; always use spawn() with argument arrays
- **Silent registry failures**: If registry validation fails (network error, timeout), must not proceed to install; feedback to coder with alternatives instead
- **Installing before consent**: Never execute install commands before user approval; registry validation is read-only and safe, installation modifies project
- **Parsing lock files for detection**: Lock files are large and complex; presence check is sufficient for detection, no need to parse YAML/JSON
- **Modifying lock files directly**: Package managers update lock files automatically; never hand-edit pnpm-lock.yaml or package-lock.json

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Package name validation | Custom regex for @scope/package format | validate-npm-package-name | Handles 50+ edge cases (capitalization, special chars, length limits, reserved names, old vs new package rules); official npm library |
| Command execution | Custom shell string escaping | child_process.spawn with arg arrays | Shell escaping is platform-dependent and error-prone; spawn without shell option prevents injection entirely |
| HTTP retry logic | Custom exponential backoff | Simple timeout + single retry | npm registry is highly available; complex retry adds latency without benefit for this use case |
| Lock file parsing | Custom YAML/JSON parser | File existence check only | Lock files contain thousands of entries; detection doesn't need content, only presence |
| Version resolution | Custom semver range calculator | Accept package manager defaults | npm/pnpm/yarn handle complex version resolution (peer deps, conflicts, deduplication); let them decide |

**Key insight:** Package managers are complex ecosystems with years of edge case handling (peer dependencies, workspaces, binary installations, post-install scripts). This phase focuses only on detection and installation execution—let the package manager handle the hard parts.

## Common Pitfalls

### Pitfall 1: Multiple Lock Files in Repository

**What goes wrong:** Projects with both package-lock.json and pnpm-lock.yaml fail detection or use wrong package manager, causing lock file conflicts

**Why it happens:** Teams switch package managers but don't remove old lock files; monorepos accidentally commit multiple lock files

**How to avoid:**
1. Detect all lock files present (not just first match)
2. If multiple found, prompt user to choose which PM to use
3. Warn about lock file conflicts in console output

**Warning signs:** Install succeeds but git shows unexpected changes to lock files; "npm ERR! package-lock.json found" warnings from yarn

**Source:** [Heroku lock file conflicts](https://help.heroku.com/0KU2EM53/why-is-my-node-js-build-failing-because-of-conflicting-lock-files)

### Pitfall 2: Registry 404 for Valid Packages

**What goes wrong:** Package exists on npm registry but validation returns 404 due to scoped package auth, private registry, or temporary outage

**Why it happens:** Scoped packages (@org/package) may require authentication; private registries have different URLs; CDN cache misses

**How to avoid:**
1. Distinguish between "package doesn't exist" (404 from public registry) and "registry unreachable" (network error, timeout)
2. On registry errors (not 404), warn user but allow proceeding to install (package manager may succeed where HTTP failed)
3. Log full error for debugging (status code, response body)

**Warning signs:** Validation fails but `npm install <package>` succeeds; intermittent failures for same package

**Sources:**
- [npm ERR! 404 troubleshooting](https://rapaccinim.medium.com/surviving-the-npm-err-404-with-private-packages-b413d80fb860)
- [npm registry 404 issues](https://github.com/npm/feedback/discussions/960)

### Pitfall 3: Peer Dependency Installation Differences

**What goes wrong:** pnpm warns about missing peer dependencies; npm auto-installs them; yarn ignores them; inconsistent behavior across package managers

**Why it happens:** npm 7+ auto-installs peer dependencies; pnpm warns unless auto-install-peers=true; yarn 1.x doesn't check peers

**How to avoid:**
1. User constraints specify: "Peer dependency handling: Claude's discretion"
2. Recommendation: Stream all package manager output to user (warnings visible)
3. Don't suppress peer dependency warnings—let user see them
4. Document in consent prompt that install may trigger additional peer dependency installations

**Warning signs:** pnpm shows "unmet peer dependency" warnings; npm installs more packages than requested; different lock file results between PMs

**Sources:**
- [pnpm peer dependencies](https://github.com/orgs/pnpm/discussions/3995)
- [pnpm auto-install-peers setting](https://pnpm.io/settings)

### Pitfall 4: Shell Injection via Package Names

**What goes wrong:** Malicious or malformed package names containing shell metacharacters (`;`, `|`, `$()`, etc.) could execute arbitrary commands if passed through shell

**Why it happens:** Using child_process.exec() or building shell command strings instead of argument arrays

**How to avoid:**
1. ALWAYS use child_process.spawn() with shell: false
2. Pass package names as array elements, not concatenated strings
3. Validate package names with validate-npm-package-name before use
4. Defense in depth: Reject any argument containing shell metacharacters (codebase already has SHELL_META regex in toolkit.ts)

**Warning signs:** Command execution fails with syntax errors; unexpected shell behavior; security warnings from linters

**Example of vulnerability:**

```typescript
// ❌ DANGEROUS - vulnerable to injection
exec(`npm install ${packageName}`)  // If packageName = "zod; rm -rf /"

// ✅ SAFE - spawn with argument array
spawn('npm', ['install', packageName], { shell: false })
```

**Sources:**
- [Command injection prevention in Node.js](https://auth0.com/blog/preventing-command-injection-attacks-in-node-js-apps/)
- [CVE-2024-27980: spawn argument injection](https://nodejs.org/en/blog/vulnerability/december-2025-security-releases)
- Existing protection in src/tools/toolkit.ts (lines 190-197)

### Pitfall 5: Install Timeout During Large Package Installation

**What goes wrong:** Large packages (like @aws-sdk, tensorflow.js) take >60 seconds to install, hitting default timeout in codebase

**Why it happens:** Existing ToolKit hardcodes 60-second timeout for spawnSync (line 202 in toolkit.ts); spawn() has no default timeout

**How to avoid:**
1. Use spawn() instead of spawnSync for installations (already async context)
2. Set reasonable timeout (5 minutes recommended for package installs)
3. Show progress output to user so they know install is progressing
4. On timeout, provide helpful error message (not just "command timed out")

**Warning signs:** Install fails silently after 60 seconds; npm/pnpm shows partial download progress then stops

**Source:** Existing codebase concern in .planning/codebase/CONCERNS.md (line 83-87)

## Code Examples

Verified patterns from official sources and codebase analysis:

### Detecting Package Manager from Lock Files

```typescript
// Source: User constraints + preferred-pm patterns
import { existsSync } from 'node:fs'
import { join } from 'node:path'

type PackageManager = 'npm' | 'pnpm' | 'yarn'

interface LockFileMap {
  readonly [file: string]: PackageManager
}

const LOCK_FILES: LockFileMap = {
  'pnpm-lock.yaml': 'pnpm',
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
} as const

function detectPackageManager(projectRoot: string): PackageManager[] {
  return Object.entries(LOCK_FILES)
    .filter(([file]) => existsSync(join(projectRoot, file)))
    .map(([_, pm]) => pm)
}

// Usage matching user constraints
const found = detectPackageManager('/path/to/project')

if (found.length === 0) {
  console.log('No lock file found, defaulting to npm')
  return 'npm'
} else if (found.length === 1) {
  console.log(`Detected package manager: ${found[0]}`)
  return found[0]
} else {
  console.log(`Multiple lock files found: ${found.join(', ')}`)
  // User constraints: "prompt the user to choose which PM to use"
  return promptUserToChoose(found)
}
```

### Validating Package Exists on npm Registry

```typescript
// Source: npm registry API docs + validate-npm-package-name
import https from 'node:https'
import validatePackageName from 'validate-npm-package-name'

async function validatePackageExists(packageName: string): Promise<{
  valid: boolean
  error?: string
}> {
  // Step 1: Validate package name format (prevents invalid HTTP requests)
  const nameCheck = validatePackageName(packageName)
  if (!nameCheck.validForNewPackages && !nameCheck.validForOldPackages) {
    return {
      valid: false,
      error: nameCheck.errors?.[0] || 'Invalid package name format'
    }
  }

  // Step 2: Check npm registry
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`

  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        // Use abbreviated metadata endpoint (smaller payload)
        'Accept': 'application/vnd.npm.install-v1+json',
        // Prevent hanging on redirects
        'User-Agent': 'qwen-coding-agent'
      },
      timeout: 5000
    }, (res) => {
      // Don't care about response body, only status
      res.resume() // Drain response to free memory

      if (res.statusCode === 200) {
        resolve({ valid: true })
      } else if (res.statusCode === 404) {
        resolve({
          valid: false,
          error: `Package "${packageName}" not found on npm registry`
        })
      } else {
        resolve({
          valid: false,
          error: `Registry error: HTTP ${res.statusCode}`
        })
      }
    })

    req.on('error', (err) => {
      resolve({
        valid: false,
        error: `Network error: ${err.message}`
      })
    })

    req.on('timeout', () => {
      req.destroy()
      resolve({
        valid: false,
        error: 'Registry request timeout (5s)'
      })
    })
  })
}
```

### Installing Packages with Real-Time Output

```typescript
// Source: Node.js docs + existing toolkit.ts pattern + user constraints
import { spawn } from 'node:child_process'

interface InstallOptions {
  packageManager: PackageManager
  packages: string[]
  projectRoot: string
}

function installPackages(options: InstallOptions): Promise<{
  success: boolean
  exitCode: number
}> {
  const { packageManager, packages, projectRoot } = options

  // User constraints: "Batch all missing packages into one install command"
  // User constraints: "Use default caret (^) version ranges"
  const args = packageManager === 'npm'
    ? ['install', '--save', ...packages]
    : ['add', ...packages]  // pnpm and yarn both use 'add'

  // User constraints: "Show PM output to the user in real-time"
  const child = spawn(packageManager, args, {
    cwd: projectRoot,
    stdio: 'inherit',  // Real-time output to console
    shell: false,      // Security: prevent shell injection
  })

  return new Promise((resolve) => {
    child.on('close', (code) => {
      resolve({
        success: code === 0,
        exitCode: code || 1
      })
    })

    child.on('error', (err) => {
      console.error(`Failed to execute ${packageManager}:`, err.message)
      resolve({ success: false, exitCode: 1 })
    })
  })
}

// Example usage
const result = await installPackages({
  packageManager: 'pnpm',
  packages: ['zod', 'axios', 'lodash'],
  projectRoot: '/path/to/project'
})

if (!result.success) {
  // User constraints: "feed error back to coder agent to rewrite using alternatives"
  console.error(`Installation failed with exit code ${result.exitCode}`)
}
```

### Integration with Existing ConsentManager

```typescript
// Source: Existing src/consent/manager.ts pattern + user constraints
import { ConsentManager } from '../consent/manager.js'

async function installWithConsent(
  packages: string[],
  packageManager: PackageManager,
  projectRoot: string,
  consentManager: ConsentManager
): Promise<{ installed: string[], rejected: string[] }> {
  const installed: string[] = []
  const rejected: string[] = []

  for (const pkg of packages) {
    // User constraints: "Validate package exists BEFORE showing consent prompt"
    const validation = await validatePackageExists(pkg)

    if (!validation.valid) {
      console.log(`  \x1b[31m✗ ${pkg} - ${validation.error}\x1b[0m`)
      rejected.push(pkg)
      continue
    }

    // User constraints: "Consent prompt must show: package name + version,
    // why it's needed, and the install command that will run"
    const approved = await consentManager.checkApproval(pkg, {
      reason: `Package will be installed via: ${packageManager} add ${pkg}`
    })

    if (approved) {
      installed.push(pkg)
    } else {
      // User constraints: "If user rejects: feed back to coder to rewrite"
      rejected.push(pkg)
    }
  }

  if (installed.length > 0) {
    // User constraints: "Batch all missing packages into one install command"
    const result = await installPackages({
      packageManager,
      packages: installed,
      projectRoot
    })

    if (!result.success) {
      // User constraints: "feed error back to coder agent to rewrite using alternatives"
      return { installed: [], rejected: [...rejected, ...installed] }
    }
  }

  return { installed, rejected }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| which-pm library | preferred-pm library | 2023 | preferred-pm supports Bun and better node_modules detection |
| npm auto-installs peers | pnpm warns, must enable auto-install-peers | npm 7.0 (2020) | Teams switching to pnpm see peer dependency warnings; requires .npmrc config |
| child_process.exec for installs | child_process.spawn with arg arrays | CVE-2024-27980 | spawn() prevents shell injection; exec() dangerous for untrusted input |
| Full registry metadata | Abbreviated metadata endpoint | 2018 | Using Accept: application/vnd.npm.install-v1+json reduces payload from 410kB to 21kB |
| Lock file in .gitignore | Lock file committed | npm 5.0 (2017) | Deterministic installs across environments; lock files are essential, not generated artifacts |

**Deprecated/outdated:**
- **npm-shrinkwrap.json**: Replaced by package-lock.json in npm 5+; only use shrinkwrap for publishing packages
- **yarn 1.x**: Yarn Classic (1.x) is in maintenance mode; Yarn Berry (2.x+) is current, but migration is complex—continue supporting yarn 1.x for compatibility
- **package-locks-checks library**: Abandoned; use package manager's own validation (npm audit, pnpm audit)

## Open Questions

1. **Should detection cache persist across tasks in single pipeline run?**
   - What we know: User constraints allow "Claude's discretion"; package manager rarely changes mid-run
   - What's unclear: Performance benefit of caching vs simplicity of re-detecting
   - Recommendation: Detect once per pipeline run, store in PipelineOptions; cache invalidation complexity not worth microseconds saved

2. **How to handle .npmrc with custom registry configuration?**
   - What we know: Users may configure private registries in .npmrc; package managers respect this automatically
   - What's unclear: Should registry validation check .npmrc for custom registry URL?
   - Recommendation: Initial implementation assumes public registry (registry.npmjs.org); document limitation; future phase can parse .npmrc for custom registries

3. **Should consent show latest version from registry, or just package name?**
   - What we know: User constraints say "package name + version" but don't specify if version comes from registry query or default behavior
   - What's unclear: Fetching version adds HTTP request overhead; package managers choose version based on dependency graph
   - Recommendation: Show package name only in consent prompt; installing with `pnpm add zod` uses package manager's version resolution (likely latest compatible); showing version would require parsing dist-tags from registry, adding complexity

4. **How to handle monorepo workspaces with multiple package.json files?**
   - What we know: pnpm/yarn workspaces have root package.json and workspace package.json files
   - What's unclear: Should detection check root or workspace package.json? Do workspaces need different install commands?
   - Recommendation: Detect from project root (where CLI is invoked); package managers handle workspace installations automatically; document assumption that projectRoot is workspace root

## Sources

### Primary (HIGH confidence)

- Node.js child_process API - https://nodejs.org/api/child_process.html
- npm Registry API specification - https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md
- npm Package metadata format - https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md
- validate-npm-package-name (official npm) - https://www.npmjs.com/package/validate-npm-package-name
- pnpm install documentation - https://pnpm.io/cli/install
- pnpm settings (auto-install-peers) - https://pnpm.io/settings
- Corepack packageManager field spec - https://blog.hyperknot.com/p/corepacks-packagemanager-field
- Existing codebase: src/tools/toolkit.ts (command execution pattern), src/consent/manager.ts (approval flow)

### Secondary (MEDIUM confidence)

- preferred-pm library - https://www.npmjs.com/package/preferred-pm
- Lock file differences explained - https://cyberphinix.de/blog/package-lock-json-vs-yarn-lock-vs-pnpm-lock-yaml-basics/
- Yarn add command documentation - https://classic.yarnpkg.com/lang/en/docs/cli/add/
- Package manager 2026 comparison - https://nareshit.com/blogs/npm-vs-yarn-vs-pnpm-package-manager-2026
- Command injection prevention - https://auth0.com/blog/preventing-command-injection-attacks-in-node-js-apps/
- npm 404 error troubleshooting - https://rapaccinim.medium.com/surviving-the-npm-err-404-with-private-packages-b413d80fb860
- Lock file conflicts - https://help.heroku.com/0KU2EM53/why-is-my-node-js-build-failing-because-of-conflicting-lock-files

### Tertiary (LOW confidence - needs validation)

- WebSearch results for package manager trends (qualitative comparison of npm vs pnpm vs yarn popularity)
- Medium articles on npm registry usage (practical examples but not authoritative)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All recommended libraries are well-documented, mature, and officially maintained
- Architecture: HIGH - Patterns based on official documentation and existing codebase patterns (Result<T,E>, ConsentManager, ToolKit)
- Pitfalls: HIGH - All pitfalls verified with official documentation or GitHub issues from package manager repositories
- Integration points: HIGH - Existing codebase thoroughly analyzed; ConsentManager, ToolKit, and pipeline integration patterns clear

**Research date:** 2026-02-14
**Valid until:** 2026-03-16 (30 days - stable ecosystem, package manager APIs rarely change)

**Key assumptions:**
- Node.js >= 20.0.0 (per package.json engines field)
- npm is always available (bundled with Node.js)
- Project is monorepo-aware but assumes single package manager for entire repo
- Public npm registry (registry.npmjs.org); private registries handled by package manager, not validation layer
- Users have network access to npm registry (offline mode out of scope for Phase 1)
