# Phase 3: User Experience & Intelligent Alternatives - Research

**Researched:** 2026-02-14
**Domain:** CLI UX patterns, Node.js built-in modules, interactive prompting for alternatives
**Confidence:** HIGH

## Summary

Phase 3 enhances the user experience by offering built-in Node.js alternatives before installing external packages and providing contextual explanations for why packages are needed. The existing codebase already has strong foundations: a SUBSTITUTION_MAP with ~17 entries, ConsentPrompter with interactive prompting, and a pipeline that tracks which files import which packages through packageFileMap.

The primary work involves: (1) enhancing the ConsentPrompter to present alternatives as actionable choices rather than informational text, (2) expanding the SUBSTITUTION_MAP with comprehensive coverage of common npm packages that have Node.js built-in equivalents, (3) implementing file+line context tracking during import extraction to show users exactly where and why packages are needed, and (4) integrating these UX improvements into the existing pipeline consent flow.

Node.js 20+ (which is the project's minimum version) provides substantial built-in capabilities that replace popular npm packages: native fetch, crypto.randomUUID(), fs.rm/mkdir with recursive options, util.styleText() for colors, fs.glob(), and more. The research shows 15+ major npm packages that can be replaced with built-ins.

**Primary recommendation:** Enhance ConsentPrompter to support multiple-choice selection between package installation and built-in alternative, expand SUBSTITUTION_MAP with structured alternative data (not just strings), add import location tracking to show file:line context, and integrate these features into the existing checkBatchApproval flow.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:readline | Built-in | Interactive CLI prompts | Native Node.js API, no dependencies, promises support in node:readline/promises |
| zod | ^3.23.0 | Schema validation | Already used for consent schemas, type-safe validation |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ConsentPrompter | Custom | Interactive consent prompts | Already handles package approval with y/s/p/n choices |
| ConsentManager | Custom | Multi-scope approval tracking | Already integrates with pipeline's checkBatchApproval |
| ImportValidator | Custom | Extract imports and detect missing packages | Already has SUBSTITUTION_MAP and validate() method |

### Not Needed
| Alternative | Why Not | What to Use Instead |
|-------------|---------|---------------------|
| inquirer.js | Heavyweight, adds dependency overhead | Enhance existing ConsentPrompter built on node:readline |
| prompts npm package | Unnecessary dependency | Native node:readline with promises API |
| chalk/colors for output | Node.js 22.17.0+ has util.styleText() | ANSI escape codes (already used in ConsentPrompter) or util.styleText() |

**Installation:**
No new dependencies required. All features can be implemented with Node.js built-ins and existing code.

## Architecture Patterns

### Recommended Enhancement Structure
```
src/
├── tools/
│   ├── importValidator.ts         # Enhance SUBSTITUTION_MAP structure
│   └── importLocationTracker.ts   # NEW: Track file:line for imports (optional)
├── consent/
│   ├── prompter.ts                # Enhance to support alternatives selection
│   ├── manager.ts                 # Pass through alternative selection
│   └── schema.ts                  # Add useAlternative field (already exists!)
└── orchestrator/
    └── pipeline.ts                # Integrate alternative feedback to coder
```

### Pattern 1: Structured SUBSTITUTION_MAP
**What:** Replace string values with structured objects containing alternative details
**When to use:** When alternatives need more than just text descriptions (e.g., code examples, migration hints)
**Example:**
```typescript
// Current (Phase 2)
const SUBSTITUTION_MAP: Record<string, string> = {
  'axios': 'Use node:https or node:http for HTTP requests',
  'uuid': 'Use crypto.randomUUID() from node:crypto',
}

// Enhanced (Phase 3)
type AlternativeInfo = {
  description: string
  module: string  // e.g., 'node:crypto', 'node:fs/promises'
  example?: string  // Optional code snippet
  minNodeVersion?: string  // e.g., '18.0.0', '20.6.0'
}

const SUBSTITUTION_MAP: Record<string, AlternativeInfo> = {
  'axios': {
    description: 'Use node:https or native fetch() for HTTP requests',
    module: 'node:https',
    example: 'const res = await fetch("https://api.example.com")',
    minNodeVersion: '18.0.0',  // fetch is stable in Node 18+
  },
  'uuid': {
    description: 'Use crypto.randomUUID() from node:crypto',
    module: 'node:crypto',
    example: 'import { randomUUID } from "node:crypto"; const id = randomUUID()',
    minNodeVersion: '14.17.0',
  },
}
```

### Pattern 2: Import Location Tracking
**What:** Track file and line number where imports are detected during extraction
**When to use:** When providing contextual "why" explanations to users
**Example:**
```typescript
// Enhanced ImportValidationResult
export type ImportValidationResult = {
  valid: boolean
  missingPackages: string[]
  suggestedFixes: string[]
  // NEW: Location context for UX
  packageLocations?: Map<string, Array<{ file: string; line: number }>>
}

// During extraction (rough pseudocode)
private extractImportsWithLocation(code: string, filePath: string): Map<string, number[]> {
  const lines = code.split('\n')
  const packageLines = new Map<string, number[]>()

  lines.forEach((line, idx) => {
    const match = /import .+ from ['"]([^'"]+)['"]/.exec(line)
    if (match) {
      const pkg = extractPackageName(match[1])
      const lineNums = packageLines.get(pkg) ?? []
      lineNums.push(idx + 1)  // 1-indexed
      packageLines.set(pkg, lineNums)
    }
  })

  return packageLines
}
```

### Pattern 3: Enhanced ConsentPrompter with Alternatives
**What:** Extend existing prompt to show alternatives as selectable options, not just info
**When to use:** When suggestedAlternatives contains built-in options
**Example:**
```typescript
// ConsentPrompter.prompt() enhancement
async prompt(options: ConsentPromptOptions): Promise<ConsentResponse> {
  // ... existing header display ...

  const alternatives = options.suggestedAlternatives ?? []
  const builtInAlts: AlternativeInfo[] = []

  // Check if alternatives are from SUBSTITUTION_MAP (structured)
  for (const alt of alternatives) {
    if (typeof alt === 'object' && alt.module) {
      builtInAlts.push(alt)
    }
  }

  if (builtInAlts.length > 0) {
    console.log('')
    console.log(`\x1b[36m  💡 Built-in Node.js alternatives:\x1b[0m`)
    for (let i = 0; i < builtInAlts.length; i++) {
      const alt = builtInAlts[i]
      console.log(`     ${i + 1}. ${alt.module} - ${alt.description}`)
      if (alt.example) {
        console.log(`        Example: ${alt.example}`)
      }
    }
  }

  console.log('')
  console.log('  Options:')
  console.log('    [y] Install package')
  console.log('    [n] Reject (stop and fix manually)')
  if (builtInAlts.length > 0) {
    console.log('    [1-9] Use built-in alternative instead')
  }

  const answer = await this.ask('  Your choice: ')
  const input = answer.toLowerCase().trim()

  // Parse numeric choice for alternatives
  const num = parseInt(input, 10)
  if (!isNaN(num) && num >= 1 && num <= builtInAlts.length) {
    const alt = builtInAlts[num - 1]
    return {
      approved: true,
      scope: 'once',
      useAlternative: alt.module  // e.g., 'node:crypto'
    }
  }

  // ... existing y/n handling ...
}
```

### Pattern 4: Pipeline Integration with Alternative Feedback
**What:** When user selects alternative, send feedback to coder to rewrite with built-in
**When to use:** In pipeline's import validation loop when useAlternative is set
**Example:**
```typescript
// In pipeline.ts import validation loop
const consentResult = await importValidator.validateWithConsent(
  change.content,
  options.consentManager
)

// If user chose alternative, provide feedback to coder
if (consentResult.useAlternative) {
  const altModule = consentResult.useAlternative
  const feedbackLines = [
    `User chose to use built-in alternative instead of installing package.`,
    `Replace imports of "${pkg}" with "${altModule}".`,
    `Example: import { randomUUID } from "${altModule}"`,
  ]

  codeResult = await coderAgent(
    { ...coderInput, importValidationFeedback: feedbackLines.join('\n') },
    createAgentContext('coder')
  )
}
```

### Pattern 5: File Context Display
**What:** Show users which files need the package and why
**When to use:** When presenting package approval prompt
**Example:**
```typescript
// Enhanced prompt display
console.log('')
console.log(`\x1b[33m  ⚠️  DEPENDENCY APPROVAL REQUIRED\x1b[0m`)
console.log(`  Package: \x1b[1m${options.package}\x1b[0m`)
if (options.reason) {
  console.log(`  Reason: ${options.reason}`)
}

// NEW: Show file context
if (options.fileContext && options.fileContext.length > 0) {
  console.log('')
  console.log('  Used in:')
  for (const ctx of options.fileContext) {
    console.log(`    - ${ctx.file}:${ctx.line}`)
  }
}
```

### Anti-Patterns to Avoid
- **Over-engineering location tracking:** Don't build full AST parser just for line numbers. Regex on split lines is sufficient for UX purposes.
- **Breaking existing consent flow:** ConsentPrompter already works well. Enhance, don't rewrite.
- **Adding new dependencies:** All functionality can be built with Node.js built-ins and existing code.
- **Blocking alternatives for stable packages:** Don't suggest replacing well-maintained packages like zod or commander with custom code.
- **Auto-selecting alternatives:** User must explicitly choose. Don't default to built-in without consent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive CLI prompts | Custom input handling with stdin events | Enhance existing ConsentPrompter (uses node:readline) | Already works, well-tested, handles edge cases |
| ANSI color codes | Custom color formatter | ANSI escape codes (already used) or util.styleText() (Node 22.17.0+) | Built-in, no dependencies, sufficient for CLI |
| Package name validation | Custom regex | validate-npm-package-name (already installed) | Handles all npm naming edge cases |
| Import extraction | Full TypeScript/Babel parser | Enhanced regex on code strings | Existing ImportValidator regex works, adding AST parser is overkill for this use case |

**Key insight:** Phase 3 is about enhancing existing UX, not building new infrastructure. The hard work (import validation, consent management, pipeline integration) is already done in Phase 1 and 2.

## Common Pitfalls

### Pitfall 1: Suggesting Obsolete Built-ins
**What goes wrong:** Recommending built-ins that are deprecated or experimental without version checks
**Why it happens:** Node.js evolves fast; features move from experimental to stable across versions
**How to avoid:** Include minNodeVersion in SUBSTITUTION_MAP, check against engines.node in package.json (>=20.0.0 for this project)
**Warning signs:** User complaints about "module not found" for built-ins, experimental warnings in output

### Pitfall 2: Breaking Existing Package Approvals
**What goes wrong:** Users who previously approved packages in session/project scope get re-prompted
**Why it happens:** Changing consent flow logic without preserving existing approval checks
**How to avoid:** ConsentManager.checkApproval() already handles project/session scope. Enhance only the interactive prompt section when neither applies.
**Warning signs:** Repeated prompts for same package in single session, project-approved packages asking for re-approval

### Pitfall 3: Alternative Selection Without Coder Feedback
**What goes wrong:** User selects alternative but coder isn't told to rewrite, code still uses original package
**Why it happens:** ConsentResponse.useAlternative is captured but not fed back to coder retry
**How to avoid:** Pipeline must check for useAlternative in consent result and trigger coder retry with explicit feedback
**Warning signs:** User selects "use node:crypto" but generated code still imports uuid

### Pitfall 4: Incomplete SUBSTITUTION_MAP Coverage
**What goes wrong:** Common packages don't have alternatives listed, UX improvement only applies to subset
**Why it happens:** SUBSTITUTION_MAP created incrementally, doesn't cover full ecosystem
**How to avoid:** Research and add all packages from "15 Node.js features replacing npm packages" article, prioritize by download counts
**Warning signs:** Gaps in coverage for popular packages like chalk, glob, rimraf

### Pitfall 5: File Context Overhead
**What goes wrong:** Tracking file:line for every import adds significant parsing overhead
**Why it happens:** Running line-by-line regex for every code file in every validation pass
**How to avoid:** Make location tracking opt-in or lazy (only compute when displaying prompt), reuse existing regex passes
**Warning signs:** Noticeable slowdown in import validation, increased pipeline execution time

### Pitfall 6: Confusing Alternative Descriptions
**What goes wrong:** Users don't understand what "Use node:https" means or how to migrate
**Why it happens:** Terse descriptions without examples or context
**How to avoid:** Include code examples in SUBSTITUTION_MAP, show migration snippet in prompt
**Warning signs:** Users always choose to install package instead of alternative, support questions about built-ins

### Pitfall 7: Mixing Install Commands with Alternatives
**What goes wrong:** suggestedAlternatives array contains both built-in suggestions and install command strings
**Why it happens:** Pipeline's batch approval currently passes `suggestedAlternatives: ['Install command: npm install ...']`
**How to avoid:** Separate InstallCommand metadata from AlternativeInfo, or use type guards to distinguish
**Warning signs:** ConsentPrompter shows "Install command" as numbered alternative choice

## Code Examples

Verified patterns from codebase and official sources:

### Current Import Extraction (from importValidator.ts)
```typescript
// Source: /home/reset/Coding/QwenCodingAgent/src/tools/importValidator.ts
private extractImports(code: string): Set<string> {
  // Strip comments
  let stripped = code.replace(/\/\*[\s\S]*?\*\//g, '')
  stripped = stripped.replace(/\/\/.*$/gm, '')

  const packages = new Set<string>()

  // ES6 static imports
  const es6Pattern = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = es6Pattern.exec(stripped)) !== null) {
    packages.add(match[1])
  }

  // CommonJS require
  const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = requirePattern.exec(stripped)) !== null) {
    packages.add(match[1])
  }

  // ... filter and extract package names
  return result
}
```

### Current Consent Prompt (from consent/prompter.ts)
```typescript
// Source: /home/reset/Coding/QwenCodingAgent/src/consent/prompter.ts
async prompt(options: ConsentPromptOptions): Promise<ConsentResponse> {
  console.log('')
  console.log(`\x1b[33m  ⚠️  DEPENDENCY APPROVAL REQUIRED\x1b[0m`)
  console.log(`  Package: \x1b[1m${options.package}\x1b[0m`)
  if (options.reason) {
    console.log(`  Reason: ${options.reason}`)
  }

  // Show alternatives
  const alternatives = options.suggestedAlternatives ?? []
  if (alternatives.length > 0) {
    console.log('')
    console.log(`\x1b[36m  💡 Alternatives already installed:\x1b[0m`)
    for (let i = 0; i < alternatives.length; i++) {
      console.log(`     ${i + 1}. ${alternatives[i]}`)
    }
  }

  // ... options display and input handling
  // NOTE: Currently displays alternatives but selection returns useAlternative as string
}
```

### Node.js readline/promises API (Official)
```typescript
// Source: https://nodejs.org/api/readline.html
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const rl = readline.createInterface({ input, output })

const answer = await rl.question('What do you think of Node.js? ')
console.log(`Thank you for your valuable feedback: ${answer}`)

rl.close()
```

### Current Pipeline packageFileMap (from pipeline.ts)
```typescript
// Source: /home/reset/Coding/QwenCodingAgent/src/orchestrator/pipeline.ts (lines 189-201)
// Track which files import each package for categorization
const packageFileMap = new Map<string, string[]>()

for (const change of codeResult.value.changes) {
  if (!jsExtensions.test(change.path)) continue
  const result = importValidator.validate(change.content)
  if (!result.valid) {
    allMissing.push(...result.missingPackages)
    allSuggestions.push(...result.suggestedFixes)
    for (const pkg of result.missingPackages) {
      const files = packageFileMap.get(pkg) ?? []
      files.push(change.path)
      packageFileMap.set(pkg, files)
    }
  }
}
```

### Node.js Built-in fetch (Official)
```typescript
// Source: https://nodejs.org/api/globals.html#fetch
// Native fetch available in Node.js 18+, stable in Node 20+
const response = await fetch('https://api.example.com/data')
const data = await response.json()

// Replaces: axios, node-fetch, got, request, superagent
```

### Node.js crypto.randomUUID() (Official)
```typescript
// Source: https://nodejs.org/api/crypto.html#cryptorandomuuidoptions
import { randomUUID } from 'node:crypto'

const id = randomUUID()
// Example: '36b8f84d-df4e-4d49-b662-bcde71a8764f'

// Replaces: uuid npm package
```

### Node.js util.styleText() (Node 22.17.0+)
```typescript
// Source: https://nodejs.org/api/util.html#utilstyletextformat-text-options
import { styleText } from 'node:util'

console.log(styleText('red', 'Error:'), 'Something went wrong')
console.log(styleText(['bold', 'green'], 'Success!'))

// Replaces: chalk, colors, kleur npm packages
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Install axios for HTTP | Native fetch() | Node 18.0.0 (stable in 20+) | Zero dependencies for basic HTTP requests |
| Install uuid for IDs | crypto.randomUUID() | Node 14.17.0 | Built-in UUID v4 generation |
| Install chalk for colors | util.styleText() or ANSI codes | Node 22.17.0 (util.styleText) | No dependency for terminal colors |
| Install glob for file search | fs.glob() | Node 22.0.0 | Native glob matching |
| Install rimraf for recursive delete | fs.rm({ recursive: true }) | Node 12.10.0 | Built-in recursive file operations |
| Install mkdirp for mkdir -p | fs.mkdir({ recursive: true }) | Node 10.12.0 | Native recursive directory creation |
| String-based SUBSTITUTION_MAP | Structured AlternativeInfo objects | Phase 3 (this phase) | Better UX with examples and version info |
| Alternatives as informational text | Alternatives as selectable options | Phase 3 (this phase) | User can choose instead of just reading |

**Deprecated/outdated:**
- **String suggestedFixes in ImportValidator**: Still works but insufficient for rich UX. Should return structured data.
- **request npm package**: Deprecated in 2020, recommend native fetch or node:https.
- **Experimental flags for fetch/WebSocket**: fetch is now stable (Node 20+), WebSocket still experimental (Node 21+).

## Open Questions

1. **Should line number tracking be implemented in Phase 3 or deferred?**
   - What we know: packageFileMap already tracks which files import each package
   - What's unclear: Is line-level precision needed for v1, or is file-level sufficient?
   - Recommendation: Start with file-level context (already available), add line tracking in future iteration if users request it

2. **How should useAlternative flow back to coder?**
   - What we know: ConsentResponse.useAlternative field exists, pipeline has coder retry mechanism
   - What's unclear: Should alternative selection trigger automatic coder retry, or require additional consent?
   - Recommendation: Treat alternative selection like package rejection - automatically retry coder with feedback explaining the substitution

3. **Should SUBSTITUTION_MAP version checks be strict or advisory?**
   - What we know: Project requires Node >=20.0.0, most built-in alternatives are stable by Node 20
   - What's unclear: Should alternatives requiring Node 22+ be filtered out, or shown with warning?
   - Recommendation: Filter to only show alternatives compatible with engines.node from package.json (>=20.0.0)

4. **How to handle packages with partial built-in replacements?**
   - What we know: Some packages like lodash have mixed utility - some functions have native equivalents, others don't
   - What's unclear: Should SUBSTITUTION_MAP recommend "use native Array methods" for lodash, or be more specific?
   - Recommendation: For partial replacements, provide specific guidance (e.g., "lodash.debounce: no built-in, but consider implementing manually" vs "lodash.map: use native Array.prototype.map")

5. **Should alternatives include migration effort estimate?**
   - What we know: fetch is drop-in for basic axios usage, but complex interceptor setups require significant rewrite
   - What's unclear: Should AlternativeInfo include effort/complexity field to help users decide?
   - Recommendation: Start without effort estimates (keep it simple), add if user feedback indicates decision paralysis

## Sources

### Primary (HIGH confidence)
- Node.js official documentation - https://nodejs.org/api/modules.html (built-in modules, node: prefix)
- Node.js official documentation - https://nodejs.org/api/readline.html (readline API, promises)
- Existing codebase: src/tools/importValidator.ts, src/consent/prompter.ts, src/orchestrator/pipeline.ts
- Existing codebase: src/tools/dependencyCategorizer.ts (file context patterns)

### Secondary (MEDIUM confidence)
- [15 Recent Node.js Features that Replace Popular npm Packages](https://nodesource.com/blog/nodejs-features-replacing-npm-packages) (verified list of built-in alternatives)
- [Command Line Interface Guidelines](https://clig.dev/) (CLI UX best practices)

### Tertiary (LOW confidence - informational only)
- Web search results about interactive CLI prompts and multiple choice best practices (general patterns, not specific to Node.js)
- npm package alternatives discussions (ecosystem trends, but not authoritative for technical implementation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All features implementable with Node.js built-ins and existing code, no new dependencies
- Architecture patterns: HIGH - Building on existing ConsentPrompter/ImportValidator/pipeline patterns, verified in codebase
- Built-in alternatives coverage: HIGH - Official Node.js docs and verified article provide comprehensive list
- UX patterns: MEDIUM - CLI best practices are well-established, but specific integration points need validation during implementation
- Line tracking implementation: MEDIUM - Technically straightforward but design decisions (file vs line level) remain open

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days - Node.js ecosystem is stable, built-in APIs don't change frequently)

**Node.js version context:**
- Project minimum: Node.js 20.0.0 (from package.json engines)
- Current LTS: Node.js 22.x (as of Feb 2026)
- Tested version: v24.13.0 (detected in environment)
- Impact: All suggested built-in alternatives are available and stable in Node 20+
