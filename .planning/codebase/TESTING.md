# Testing Patterns

**Analysis Date:** 2026-02-13

## Test Framework

**Runner:**
- Vitest ^2.0.0 - zero-config test runner
- Config: `vitest.config.ts`
- Environment: Node.js

**Assertion Library:**
- Vitest built-in assertions via `expect()`
- Pattern: `expect(value).toBe(expected)`, `expect(fn).toHaveBeenCalled()`

**Run Commands:**
```bash
npm run test                    # Run all unit tests (excludes integration)
npm run test:watch             # Watch mode for development
npm run test:all               # Run all tests including integration
npm run test:integration       # Run only integration tests
```

**Coverage:**
- Provider: v8
- Reporters: text, json, html
- Include: `src/**/*.ts`
- Exclude: `src/cli/**` (CLI commands not tested)
- View: `npm run test -- --coverage` generates HTML report

## Test File Organization

**Location:**
- Co-located with source: `src/agents/planner.ts` → `test/agents/planner.test.ts`
- Mirror directory structure: test directory mirrors src structure

**Naming:**
- File format: `{module}.test.ts`
- Examples: `planner.test.ts`, `client.test.ts`, `manager.test.ts`

**Structure:**
```
test/
├── agents/
│   └── planner.test.ts
├── consent/
│   ├── manager.test.ts
│   ├── storage.test.ts
│   └── prompter.test.ts
├── integration/
│   └── pipeline.integration.test.ts
├── llm/
│   └── client.test.ts
├── orchestrator/
│   └── pipeline.test.ts
├── schemas/
│   ├── planner.test.ts
│   └── reviewer.test.ts
└── tools/
    ├── dependencyContext.test.ts
    └── importValidator.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
describe('ModuleOrFunction', () => {
  // Hooks
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Test group
  describe('method or scenario', () => {
    it('does something specific', () => {
      // Arrange
      const input = ...

      // Act
      const result = ...

      // Assert
      expect(result).toBe(...)
    })
  })
})
```

**Patterns Observed:**
- Arrange-Act-Assert (AAA) pattern
- `describe()` blocks group related tests
- Nested `describe()` for specific methods or scenarios
- `beforeEach()` runs before each test to clear mocks

**Example from `test/agents/planner.test.ts`:**
```typescript
describe('plannerAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns tasks on success', async () => {
    const mockLLM: LLMClient = {
      generate: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue(ok({ tasks: [...] })),
    }

    const result = await plannerAgent({ request: '...', projectContext: '...' }, context)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tasks.length).toBe(1)
    }
  })
})
```

## Mocking

**Framework:** Vitest's `vi` module

**Mock Functions:**
- `vi.fn()` - Create mock function
- `vi.fn().mockResolvedValue(...)` - Mock async function success
- `vi.fn().mockRejectedValue(...)` - Mock async function error
- `vi.fn().mockResolvedValueOnce(...).mockResolvedValueOnce(...)` - Sequential returns
- `vi.mocked()` - Type-safe mock wrapper
- `vi.mock('module')` - Module-level mocking

**Module Mocking:**
```typescript
vi.mock('ai', () => ({
  generateText: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn(() => 'mock-model')),
}))

import { generateText } from 'ai'
const mockGenerateText = vi.mocked(generateText)
```

**Example from `test/consent/manager.test.ts`:**
```typescript
vi.mock('../../src/consent/storage.js')
vi.mock('../../src/consent/prompter.js')

beforeEach(() => {
  mockStorage = {
    isApproved: vi.fn().mockResolvedValue(false),
    addDecision: vi.fn().mockResolvedValue(undefined),
  }

  vi.mocked(ConsentStorage).mockImplementation(() => mockStorage as unknown as ConsentStorage)
})
```

**What to Mock:**
- External dependencies: LLM client, file system operations, prompts
- Heavy operations: Network calls, file I/O
- Consents and user interactions: Always mock prompter
- Storage operations: Mock storage in unit tests

**What NOT to Mock:**
- Utility functions: Result helpers (`ok()`, `err()`), logger
- Zod schema validation: Test actual schema parsing
- Pure functions: No side effects, test directly
- TypeScript type guards: Test the actual type narrowing

## Fixtures and Factories

**Test Data Creation:**
- Inline objects in tests (no fixture files)
- Factory functions for complex objects

**Example from `test/orchestrator/pipeline.test.ts`:**
```typescript
function createMockToolKit(): ToolKit {
  return {
    readFile: vi.fn().mockReturnValue(ok('file content')),
    writeFile: vi.fn().mockReturnValue(ok(undefined)),
    listDirectory: vi.fn().mockReturnValue(ok(['file1.ts', 'file2.ts'])),
    fileExists: vi.fn().mockReturnValue(true),
    runCommand: vi.fn().mockReturnValue(ok({ stdout: '', stderr: '', exitCode: 0 })),
    getProjectRoot: vi.fn().mockReturnValue('/project'),
  }
}
```

**Agent Context Mock:**
```typescript
function createMockContext(llm: LLMClient): AgentContext {
  return {
    llm,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    conversationId: 'test-conversation',
  }
}
```

**Schema Test Data:**
```typescript
const TestSchema = z.object({
  message: z.string(),
  count: z.number(),
})

const testData = {
  message: 'hello',
  count: 42,
}
```

## Coverage

**Requirements:** No explicit target, but coverage monitored

**View Coverage:**
```bash
npm run test -- --coverage
```

**Coverage Report:**
- Excludes CLI code (`src/cli/**`)
- HTML report generated in `coverage/` directory
- Text summary in terminal

**Test Distribution (observed):**
- Unit tests: ~11 test files
- Integration tests: 1 file (`pipeline.integration.test.ts`)
- Total: ~321 test cases across codebase

## Test Types

**Unit Tests:**
- Scope: Individual functions, agents, utilities
- Approach: Mock all external dependencies
- Location: `test/agents/`, `test/llm/`, `test/tools/`, `test/schemas/`, `test/consent/`
- Examples: `planner.test.ts`, `client.test.ts`, `importValidator.test.ts`

**Schema Tests:**
- Scope: Zod schema validation
- Approach: Test `safeParse()` with valid and invalid data
- Location: `test/schemas/`
- Pattern: Test required fields, optional fields with defaults, invalid inputs

**Example from `test/schemas/planner.test.ts`:**
```typescript
describe('TaskSchema', () => {
  it('accepts valid task', () => {
    const result = TaskSchema.safeParse({
      id: 'task-1',
      title: 'Create user model',
      description: 'Define User type with validation',
    })
    expect(result.success).toBe(true)
  })

  it('provides defaults for optional arrays', () => {
    const result = TaskSchema.safeParse({ id: 'task-1', title: 'Test', description: 'Test' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dependsOn).toEqual([])
      expect(result.data.estimatedFiles).toEqual([])
    }
  })
})
```

**Integration Tests:**
- Scope: Full pipeline with real or mocked LLM
- Approach: Uses temporary directories, real file I/O
- Location: `test/integration/`
- Prerequisites: LLM server must be running or tests skip
- Env: `LLM_BASE_URL` environment variable (default: `http://localhost:11434/v1`)

**Integration Test Pattern:**
```typescript
describe('Pipeline Integration', () => {
  let tmpDir: string

  beforeAll(async () => {
    // Check LLM availability
    llmAvailable = await isLLMAvailable(llmBaseUrl)
    if (!llmAvailable) {
      console.warn(`LLM server not available at ${llmBaseUrl}`)
    }

    // Create temp project
    tmpDir = mkdtempSync(join(tmpdir(), 'agent-helper-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })
})
```

## Common Patterns

**Async Testing:**
- All async tests declared with `async` keyword
- Use `await` for async operations
- Mocks resolve/reject with `mockResolvedValue()` or `mockRejectedValue()`

**Example:**
```typescript
it('retries on invalid JSON', async () => {
  mockGenerateText
    .mockResolvedValueOnce({ text: 'not json' } as never)
    .mockResolvedValueOnce({ text: '{"message": "hello", "count": 42}' } as never)

  const result = await client.generateStructured([...], TestSchema)

  expect(result.ok).toBe(true)
  expect(mockGenerateText).toHaveBeenCalledTimes(2)
})
```

**Result Type Testing:**
- Always check `result.ok` first
- Use type guards in if-blocks for TypeScript narrowing
- Check error properties after narrowing to error type

**Pattern:**
```typescript
expect(result.ok).toBe(true)
if (result.ok) {
  expect(result.value.tasks.length).toBe(1)
  expect(result.value.tasks[0]?.id).toBe('task-1')
}

expect(result.ok).toBe(false)
if (!result.ok) {
  expect(result.error.type).toBe('connection')
}
```

**Error Testing:**
- Test both success and error paths
- Verify error types and messages
- Test retry logic when applicable

**Example from `test/llm/client.test.ts`:**
```typescript
it('returns connection error on ECONNREFUSED', async () => {
  mockGenerateText.mockRejectedValue(new Error('ECONNREFUSED'))

  const result = await client.generate([{ role: 'user', content: 'Test' }])

  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.error.type).toBe('connection')
  }
})

it('returns error after max retries', async () => {
  mockGenerateText.mockResolvedValue({ text: 'invalid' } as never)

  const result = await client.generateStructured([...], TestSchema, { retries: 2 })

  expect(result.ok).toBe(false)
  expect(mockGenerateText).toHaveBeenCalledTimes(2)
})
```

**Batch Processing Tests:**
- Test sequential approval chains
- Verify stopping on first rejection
- Test both approval and rejection paths

**Example from `test/consent/manager.test.ts`:**
```typescript
it('approves all packages sequentially', async () => {
  mockPrompter.prompt
    .mockResolvedValueOnce({ approved: true, scope: 'once' })
    .mockResolvedValueOnce({ approved: true, scope: 'once' })

  const approved = await manager.checkBatchApproval(['axios', 'lodash'])

  expect(approved).toEqual(['axios', 'lodash'])
})

it('stops on first rejection', async () => {
  mockPrompter.prompt
    .mockResolvedValueOnce({ approved: true, scope: 'once' })
    .mockResolvedValueOnce({ approved: false, scope: 'once' })

  const approved = await manager.checkBatchApproval(['axios', 'lodash', 'chalk'])

  expect(approved).toEqual(['axios'])
  expect(mockPrompter.prompt).toHaveBeenCalledTimes(2)
})
```

## Test Utilities

**Mock Creation Helpers:**
- `createMockContext()` - Create AgentContext with mocked logger
- `createMockToolKit()` - Create ToolKit with all methods mocked
- Factory patterns reduce test boilerplate

**Assertions:**
- `expect().toBe()` - Strict equality
- `expect().toEqual()` - Deep equality
- `expect().toHaveBeenCalled()` - Mock call verification
- `expect().toHaveBeenCalledTimes(n)` - Call count verification
- `expect().toHaveBeenCalledWith()` - Call argument verification

---

*Testing analysis: 2026-02-13*
