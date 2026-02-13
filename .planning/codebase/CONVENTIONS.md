# Coding Conventions

**Analysis Date:** 2026-02-13

## Naming Patterns

**Files:**
- Lower camelCase for all TypeScript files: `logger.ts`, `importValidator.ts`, `planner.ts`
- Exception: Test files use `.test.ts` suffix: `client.test.ts`, `planner.test.ts`
- One module per file: each file exports a single primary export or factory function

**Functions:**
- Exported functions use camelCase: `createLogger()`, `createToolKit()`, `plannerAgent()`, `runPipeline()`
- Factory functions prefixed with `create`: `createLogger()`, `createLLMClient()`, `createAgentContext()`
- Internal helper functions are camelCase and documented with JSDoc
- Async functions return `Promise<Result<T, E>>` wrapped types (not thrown errors)

**Variables:**
- camelCase for all variable names: `projectContext`, `conversationId`, `mockLLM`, `isPathSafe`
- Type guards and predicates use `is` prefix: `isOk()`, `isErr()`, `isSensitivePath()`
- Boolean checks use `is`/`has` prefixes: `fileExists()`, `existsSync()`
- Constants use UPPER_SNAKE_CASE: `ALLOWED_COMMANDS`, `SENSITIVE_PATHS`, `LOG_LEVEL_PRIORITY`

**Types:**
- PascalCase for all types, interfaces, and schemas: `Result<T, E>`, `Logger`, `ToolKit`, `AgentError`
- Schema types suffixed with `Schema`: `PlannerOutputSchema`, `TaskSchema`, `AgentErrorSchema`
- Type exports use `type` keyword for clarity: `export type Logger = { ... }`
- Union types for discriminated unions: `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`

## Code Style

**Formatting:**
- Target: ES2022
- Module system: ESNext with verbatim module syntax
- File extensions: Always include `.js` extension in relative imports: `import { x } from './utils.js'`
- No automatic semicolon insertion - semicolons required throughout

**Linting:**
- ESLint configured with version ^9.0.0
- Run: `npm run lint` to check
- File: `.eslintrc` configuration (if present)

**Strict TypeScript:**
- `strict: true` - all strict checks enabled
- `noUncheckedIndexedAccess: true` - prevents unsafe index access
- `noImplicitOverride: true` - explicit override keyword required
- `noPropertyAccessFromIndexSignature: true` - strict property access
- `exactOptionalPropertyTypes: true` - distinguishes undefined from optional
- Compiler targets ES2022 for modern features

## Import Organization

**Order:**
1. Node.js built-in modules: `import { readFileSync } from 'node:fs'` (with `node:` prefix)
2. Third-party packages: `import { z } from 'zod'`, `import { generateText } from 'ai'`
3. Type imports: `import type { Logger } from '../utils/logger.js'`
4. Local relative imports: `import { createLogger } from '../utils/logger.js'`
5. Local index/barrel imports: `import * from './index.js'`

**Path Aliases:**
- Not used - always relative imports starting with `./` or `../`
- Explicit `.js` extensions required on all relative imports

**Module Organization:**
- Barrel files use re-export pattern: `export * from './result.js'` in `index.ts`
- No default exports - only named exports for consistency

## Error Handling

**Patterns:**
- Use `Result<T, E>` type for recoverable errors (no exceptions thrown)
- Pattern: `{ ok: true; value: T } | { ok: false; error: E }`
- Helper functions: `ok(value)`, `err(error)`, `isOk()`, `isErr()`, `unwrap()`, `map()`, `flatMap()`, `all()`
- Chaining: `result.flatMap(fn).map(transform).flatMap(validate)`

**Error Types:**
- Domain errors defined with Zod schemas: `AgentErrorSchema`, `ToolErrorSchema`, `LLMErrorSchema`
- Error type discriminators: `type: 'connection' | 'timeout' | 'schema_validation' | ...`
- Retry context: errors include `retryable` boolean flag

**Example Pattern:**
```typescript
const result = await context.llm.generateStructured(messages, schema)
if (!result.ok) {
  context.logger.error({ error: result.error }, 'Agent failed')
  return err({ type: 'llm_error', message: result.error.message, details: result.error })
}
return result
```

## Logging

**Framework:** Custom logger implementation in `src/utils/logger.ts`

**Usage Pattern:**
- Create scoped logger: `const logger = context.logger` (already scoped in agents)
- Create child scope: `const childLogger = logger.child('scope-name')`
- Log levels: `debug()`, `info()`, `warn()`, `error()`
- Signature: `logger.info(data?: LogData, message?: string)` with optional data first, message second

**Examples:**
```typescript
context.logger.info({ request: input.request.slice(0, 100) }, 'Starting planner agent')
context.logger.error({ error: result.error }, 'Planner agent failed')
context.logger.info({ taskCount: result.value.tasks.length }, 'Planner agent completed')
```

**Output Modes:**
- Default: human-readable format with colors when TTY detected
- Option: JSON output with `jsonOutput: true`
- Error/warn written to stderr, info/debug to stdout

## Comments

**When to Comment:**
- JSDoc comments on exported functions and type definitions
- Doc comments explain "why" not "what" - the code shows what it does
- Inline comments only for non-obvious algorithms or workarounds
- Implementation details documented in function JSDoc

**JSDoc/TSDoc:**
- JSDoc comments on exported functions and types
- Pattern: `/** Description here */`
- Used extensively in `src/utils/result.ts` for Result type helpers
- Parameter and return types optional (TypeScript infers from signatures)

**Example:**
```typescript
/**
 * Result type for handling expected failures without exceptions.
 * Use this for LLM parse errors, tool failures, and other recoverable errors.
 */
export type Result<T, E> = ...

/**
 * Try to parse JSON from LLM response, handling common issues
 */
function tryParseJSON(text: string): unknown { ... }
```

## Function Design

**Size:**
- Functions stay under 100 lines when possible
- Complex parsing/validation broken into helper functions
- Factory functions (`create*`) return configured objects/closures

**Parameters:**
- Single configuration object for 2+ parameters
- Async functions take `input` and `context` parameters
- Agent pattern: `(input: I, context: AgentContext) => Promise<Result<O, AgentError>>`

**Return Values:**
- Async functions return `Promise<Result<T, E>>` not thrown errors
- Sync utility functions return `Result<T, E>` for error cases
- Factory functions return object with typed methods

**Example (Agent):**
```typescript
export const plannerAgent: Agent<PlannerInput, PlannerOutput> = async (
  input: PlannerInput,
  context: AgentContext
): Promise<Result<PlannerOutput, AgentError>> => {
  // Implementation
}
```

## Module Design

**Exports:**
- Named exports only - no default exports
- Type exports with `export type` keyword
- Barrel files re-export from subdirectories

**Barrel Files:**
- Pattern in `src/utils/index.ts`: `export * from './result.js'`
- Pattern in `src/tools/index.ts`: `export * from './toolkit.js'`
- Used to simplify imports: `import { ok, err } from '../utils'`

**Dependency Injection:**
- Context objects (AgentContext, PipelineOptions) inject dependencies
- Factories (createLogger, createToolKit) return configured closures
- Tests use `vi.fn()` mocks to inject test doubles

## Type System Patterns

**Union Types:**
- Discriminated unions for error types: `{ type: 'connection', ... } | { type: 'timeout', ... }`
- Result type: `{ ok: true; value: T } | { ok: false; error: E }`
- Zod schemas generate types: `type AgentError = z.infer<typeof AgentErrorSchema>`

**Generic Types:**
- Agent generic: `Agent<I, O> = (input: I, context: AgentContext) => Promise<Result<O, AgentError>>`
- Result generic: `Result<T, E>` used everywhere for error handling
- Zod generics: `z.ZodType<Output, Def, Input>`

---

*Convention analysis: 2026-02-13*
