import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runPipeline } from '../../src/orchestrator/pipeline.js'
import { createLLMClient } from '../../src/llm/client.js'
import { createToolKit } from '../../src/tools/toolkit.js'
import { createLogger } from '../../src/utils/logger.js'
import { getDefaultConfig } from '../../src/utils/config.js'
import { applyChanges, stageChanges } from '../../src/orchestrator/staging.js'

/**
 * Integration test that runs the full pipeline against a real LLM.
 *
 * Prerequisites:
 * - LLM server must be running at the configured URL (default: http://localhost:11434/v1)
 * - Set LLM_BASE_URL environment variable to override
 *
 * Run with: npm run test:integration
 */

async function isLLMAvailable(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

describe('Pipeline Integration', () => {
  let tmpDir: string
  let cleanupFn: () => void
  let llmAvailable = false
  let llmBaseUrl: string

  beforeAll(async () => {
    // Check LLM availability
    llmBaseUrl = process.env['LLM_BASE_URL'] || 'http://localhost:11434/v1'
    llmAvailable = await isLLMAvailable(llmBaseUrl)

    if (!llmAvailable) {
      console.warn(`\n⚠️  LLM server not available at ${llmBaseUrl}`)
      console.warn('   Set LLM_BASE_URL environment variable or start your LLM server.')
      console.warn('   Integration tests will be skipped.\n')
    }

    // Create a unique temp directory for this test run
    tmpDir = mkdtempSync(join(tmpdir(), 'agent-helper-test-'))

    // Set up cleanup function
    cleanupFn = () => {
      if (tmpDir && existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    }

    // Set up a minimal project structure
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-project',
          version: '1.0.0',
          type: 'module',
          scripts: {
            build: 'tsc',
          },
          devDependencies: {
            typescript: '^5.0.0',
          },
        },
        null,
        2
      )
    )

    // Create a basic tsconfig
    writeFileSync(
      join(tmpDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
            outDir: 'dist',
          },
          include: ['src/**/*'],
        },
        null,
        2
      )
    )

    // Create src directory
    const srcDir = join(tmpDir, 'src')
    mkdirSync(srcDir, { recursive: true })
  })

  afterAll(() => {
    // Clean up temp directory
    cleanupFn()
  })

  it('builds a simple greeting module', async () => {
    if (!llmAvailable) {
      console.log('Skipping: LLM not available')
      return
    }

    const config = getDefaultConfig()
    config.llm.baseUrl = llmBaseUrl

    if (process.env['LLM_MODEL']) {
      config.llm.model = process.env['LLM_MODEL']
    }

    const logger = createLogger({ level: 'debug' })
    const llm = createLLMClient(config.llm)
    const tools = createToolKit(tmpDir)

    const request = `Create a simple greeting module with:
1. A function called 'greet' that takes a name (string) and returns a greeting message
2. A function called 'farewell' that takes a name (string) and returns a farewell message
3. Export both functions

Put the code in src/greeting.ts`

    const result = await runPipeline(request, {
      llm,
      tools,
      config,
      logger,
    })

    // Log result for debugging
    if (!result.ok) {
      console.error('Pipeline failed:', result.error)
      throw new Error(`Pipeline failed: ${result.error}`)
    }

    console.log('Pipeline result:', JSON.stringify(result.value, null, 2))

    const { results } = result.value

    // Should have at least one task result
    expect(results.length).toBeGreaterThan(0)

    // Apply the changes
    for (const taskResult of results) {
      const staged = stageChanges(taskResult.changes, tools)
      const applyResult = applyChanges(staged, tools)
      expect(applyResult.ok).toBe(true)
    }

    // Verify the greeting file was created
    const greetingPath = join(tmpDir, 'src', 'greeting.ts')
    expect(existsSync(greetingPath)).toBe(true)

    // Read and verify content
    const content = readFileSync(greetingPath, 'utf-8')

    // Should contain the greet function
    expect(content).toMatch(/greet/i)
    // Should contain the farewell function
    expect(content).toMatch(/farewell/i)
    // Should have exports
    expect(content).toMatch(/export/i)
  }, 120000) // 2 minute timeout for LLM calls

  it('builds a simple calculator module', async () => {
    if (!llmAvailable) {
      console.log('Skipping: LLM not available')
      return
    }

    const config = getDefaultConfig()
    config.llm.baseUrl = llmBaseUrl

    if (process.env['LLM_MODEL']) {
      config.llm.model = process.env['LLM_MODEL']
    }

    const logger = createLogger({ level: 'debug' })
    const llm = createLLMClient(config.llm)
    const tools = createToolKit(tmpDir)

    const request = `Create a calculator module in src/calculator.ts with:
1. An 'add' function that takes two numbers and returns their sum
2. A 'subtract' function that takes two numbers and returns their difference
3. A 'multiply' function that takes two numbers and returns their product

Export all functions.`

    const result = await runPipeline(request, {
      llm,
      tools,
      config,
      logger,
    })

    if (!result.ok) {
      console.error('Pipeline failed:', result.error)
      throw new Error(`Pipeline failed: ${result.error}`)
    }

    // Apply changes
    for (const taskResult of result.value.results) {
      const staged = stageChanges(taskResult.changes, tools)
      applyChanges(staged, tools)
    }

    // Verify the calculator file was created
    const calcPath = join(tmpDir, 'src', 'calculator.ts')
    expect(existsSync(calcPath)).toBe(true)

    const content = readFileSync(calcPath, 'utf-8')
    expect(content).toMatch(/add/i)
    expect(content).toMatch(/subtract/i)
    expect(content).toMatch(/multiply/i)
    expect(content).toMatch(/export/i)
  }, 120000)

  it('builds a multi-file todo list module with types and service', async () => {
    if (!llmAvailable) {
      console.log('Skipping: LLM not available')
      return
    }

    const config = getDefaultConfig()
    config.llm.baseUrl = llmBaseUrl

    if (process.env['LLM_MODEL']) {
      config.llm.model = process.env['LLM_MODEL']
    }

    const logger = createLogger({ level: 'debug' })
    const llm = createLLMClient(config.llm)
    const tools = createToolKit(tmpDir)

    const request = `Build a simple todo list module with the following structure:

1. src/todo/types.ts - Define a Todo type with:
   - id: string
   - title: string
   - completed: boolean
   - createdAt: Date

2. src/todo/store.ts - Create an in-memory store with:
   - A private array to hold todos
   - getAll(): returns all todos
   - getById(id): returns a todo by id or undefined
   - add(todo): adds a todo to the store
   - remove(id): removes a todo by id

3. src/todo/service.ts - Create a service that uses the store:
   - createTodo(title): creates a new todo with generated id and returns it
   - completeTodo(id): marks a todo as completed
   - deleteTodo(id): deletes a todo
   - listTodos(): returns all todos

Make sure the service imports from types and store. Use proper TypeScript types throughout.`

    const result = await runPipeline(request, {
      llm,
      tools,
      config,
      logger,
    })

    if (!result.ok) {
      console.error('Pipeline failed:', result.error)
      throw new Error(`Pipeline failed: ${result.error}`)
    }

    console.log('Pipeline result:', JSON.stringify(result.value, null, 2))

    // Apply all changes
    for (const taskResult of result.value.results) {
      const staged = stageChanges(taskResult.changes, tools)
      const applyResult = applyChanges(staged, tools)
      if (!applyResult.ok) {
        console.error('Failed to apply changes:', applyResult.error)
      }
    }

    // Verify all three files were created
    const typesPath = join(tmpDir, 'src', 'todo', 'types.ts')
    const storePath = join(tmpDir, 'src', 'todo', 'store.ts')
    const servicePath = join(tmpDir, 'src', 'todo', 'service.ts')

    expect(existsSync(typesPath)).toBe(true)
    expect(existsSync(storePath)).toBe(true)
    expect(existsSync(servicePath)).toBe(true)

    // Verify types.ts content
    const typesContent = readFileSync(typesPath, 'utf-8')
    expect(typesContent).toMatch(/Todo/i)
    expect(typesContent).toMatch(/id.*string/i)
    expect(typesContent).toMatch(/title.*string/i)
    expect(typesContent).toMatch(/completed.*boolean/i)
    expect(typesContent).toMatch(/export/i)

    // Verify store.ts content
    const storeContent = readFileSync(storePath, 'utf-8')
    expect(storeContent).toMatch(/getAll/i)
    expect(storeContent).toMatch(/getById/i)
    expect(storeContent).toMatch(/add/i)
    expect(storeContent).toMatch(/remove/i)
    expect(storeContent).toMatch(/import.*Todo.*from.*types/i)

    // Verify service.ts content
    const serviceContent = readFileSync(servicePath, 'utf-8')
    expect(serviceContent).toMatch(/createTodo/i)
    expect(serviceContent).toMatch(/completeTodo/i)
    expect(serviceContent).toMatch(/deleteTodo/i)
    expect(serviceContent).toMatch(/listTodos/i)
    expect(serviceContent).toMatch(/import/i)
  }, 180000) // 3 minute timeout for complex multi-file task
})
