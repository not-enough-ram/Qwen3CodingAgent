# Codebase Structure

**Analysis Date:** 2026-02-13

## Directory Layout

```
agent-helper/
├── src/
│   ├── index.ts                 # Main export barrel
│   ├── cli/                     # User-facing command interface
│   │   ├── index.ts             # Commander CLI setup
│   │   └── commands/
│   │       ├── run.ts           # Execute and apply changes
│   │       ├── plan.ts          # Dry-run planning
│   │       └── doctor.ts        # LLM connectivity check
│   ├── agents/                  # Specialized LLM agents
│   │   ├── types.ts             # AgentContext, Agent type definitions
│   │   ├── planner.ts           # Decompose request → tasks
│   │   ├── architect.ts         # Plan files → operations
│   │   ├── coder.ts             # Generate → file changes
│   │   ├── reviewer.ts          # Review → issues/pass
│   │   └── index.ts             # Barrel export
│   ├── orchestrator/            # Pipeline coordination
│   │   ├── pipeline.ts          # Multi-agent orchestration + retry loops
│   │   ├── staging.ts           # Change staging and application
│   │   └── index.ts             # Barrel export
│   ├── schemas/                 # Zod validation schemas
│   │   ├── common.ts            # AgentError, ToolError, LLMError types
│   │   ├── planner.ts           # PlannerInput/Output schemas
│   │   ├── architect.ts         # ArchitectInput/Output schemas
│   │   ├── coder.ts             # CoderInput/Output schemas
│   │   ├── reviewer.ts          # ReviewerInput/Output schemas
│   │   └── index.ts             # Barrel export
│   ├── prompts/                 # LLM prompt builders
│   │   ├── planner.ts           # Build planner system/user prompts
│   │   ├── architect.ts         # Build architect prompts
│   │   ├── coder.ts             # Build coder prompts (with dependency injection)
│   │   ├── reviewer.ts          # Build reviewer prompts
│   │   └── index.ts             # Barrel export
│   ├── llm/                     # LLM client abstraction
│   │   ├── client.ts            # OpenAI-compatible client with structured output
│   │   └── index.ts             # Barrel export
│   ├── tools/                   # File system and utilities
│   │   ├── toolkit.ts           # Sandboxed file/command access
│   │   ├── context.ts           # Project context gathering
│   │   ├── dependencyContext.ts # Dependency analysis
│   │   ├── importValidator.ts   # Import validation
│   │   └── index.ts             # Barrel export
│   ├── consent/                 # Consent management
│   │   ├── manager.ts           # ConsentManager orchestration
│   │   ├── prompter.ts          # User interaction for consent
│   │   ├── storage.ts           # Persistent consent storage
│   │   ├── schema.ts            # Zod schemas for consent
│   │   └── index.ts             # Barrel export
│   └── utils/                   # Shared utilities
│       ├── result.ts            # Result<T, E> type + combinators
│       ├── logger.ts            # Scoped logging
│       ├── config.ts            # Config loading + validation
│       └── index.ts             # Barrel export
├── test/
│   ├── agents/
│   │   └── planner.test.ts
│   ├── consent/
│   │   ├── manager.test.ts
│   │   ├── prompter.test.ts
│   │   └── storage.test.ts
│   ├── integration/
│   │   └── pipeline.integration.test.ts
│   ├── llm/
│   │   └── client.test.ts
│   ├── orchestrator/
│   │   └── pipeline.test.ts
│   ├── schemas/
│   │   ├── planner.test.ts
│   │   └── reviewer.test.ts
│   └── tools/
│       ├── dependencyContext.test.ts
│       └── importValidator.test.ts
├── .planning/
│   └── codebase/                # Generated codebase analysis
├── dist/                        # Compiled output (generated)
├── node_modules/               # Dependencies (generated)
├── package.json                # Project metadata
├── pnpm-lock.yaml             # Dependency lock
├── tsconfig.json              # TypeScript configuration
├── tsup.config.ts             # Build configuration
├── vitest.config.ts           # Test configuration
└── .eslintrc                  # Linting rules
```

## Directory Purposes

**src/cli/:**
- Purpose: CLI command handlers and user interaction
- Contains: Command routing, change staging/diff, user prompts
- Key files: `index.ts` (Commander setup), `commands/run.ts` (main workflow)

**src/agents/:**
- Purpose: Specialized LLM agents with type-safe contracts
- Contains: Four agents (planner, architect, coder, reviewer) + shared types
- Pattern: Each agent receives input, calls LLM, returns Result<Output, Error>

**src/orchestrator/:**
- Purpose: Orchestrates multi-agent pipeline and change application
- Contains: Task loop with retry logic, staging, file writing
- Key flow: `pipeline.ts` calls agents sequentially per task with feedback loops

**src/schemas/:**
- Purpose: Runtime type validation using Zod
- Contains: Input/output contracts for each agent + error types
- Usage: Agent outputs validated, prompts instructed by schema descriptions

**src/prompts/:**
- Purpose: Constructs LLM prompts with context injection
- Contains: System prompts with rules + user message builders
- Pattern: Each builder takes parameters, returns Message[] array

**src/llm/:**
- Purpose: LLM client abstraction with OpenAI compatibility
- Contains: Text generation, structured generation with retry logic
- Key feature: Handles Qwen3 thinking mode tags, JSON parsing resilience

**src/tools/:**
- Purpose: Safe project file access and analysis
- Contains: File ops, directory traversal, command execution, project scanning
- Security: Path validation, sensitive file protection, command whitelisting

**src/consent/:**
- Purpose: User consent management for automated changes
- Contains: Consent prompting, persistent storage, manager orchestration
- Usage: Import validation consults consent before allowing package installs

**src/utils/:**
- Purpose: Shared utilities and cross-cutting concerns
- Contains: Result type, logger, config loading
- Dependency: All layers depend on these utilities

## Key File Locations

**Entry Points:**
- `src/cli/index.ts`: CLI program definition with command routes
- `src/cli/commands/run.ts`: Main `agent-helper run` execution
- `src/cli/commands/plan.ts`: `agent-helper plan` dry-run
- `src/cli/commands/doctor.ts`: `agent-helper doctor` connectivity check
- `src/orchestrator/pipeline.ts`: Core `runPipeline()` function

**Configuration:**
- `src/utils/config.ts`: Config schema and loader
- `.agent-helper.json`: User config file (optional)
- Environment: LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, LLM_MAX_TOKENS

**Core Logic:**
- `src/agents/planner.ts`: Task decomposition
- `src/agents/architect.ts`: File structure planning
- `src/agents/coder.ts`: Code generation
- `src/agents/reviewer.ts`: Code quality review
- `src/llm/client.ts`: LLM communication with structured output

**Project Analysis:**
- `src/tools/context.ts`: Gathers project metadata (deps, tree, readme)
- `src/tools/toolkit.ts`: File system abstraction
- `src/tools/importValidator.ts`: Validates imports against installed packages
- `src/tools/dependencyContext.ts`: Analyzes package dependencies

**Testing:**
- `test/integration/pipeline.integration.test.ts`: Full pipeline tests
- `test/orchestrator/pipeline.test.ts`: Pipeline orchestration tests
- `test/llm/client.test.ts`: LLM client tests
- `test/consent/*.test.ts`: Consent management tests
- `test/tools/*.test.ts`: Tool validation tests

## Naming Conventions

**Files:**
- `*.ts`: TypeScript source files
- `*.test.ts`: Test files (Vitest)
- Agent files: `{agentName}.ts` matching agent name (planner, architect, coder, reviewer)
- Schema files: `{schemaName}.ts` mirroring agent/domain names
- Prompt files: `{agentName}.ts` matching agent they serve
- Command files: `{commandName}.ts` in `cli/commands/` directory

**Directories:**
- Feature folders: `src/{feature}/` (agents, tools, schemas, prompts)
- Nested feature commands: `src/{feature}/{subfeature}/` (cli/commands)
- Test structure mirrors src: `test/{feature}/{file}.test.ts`

**Functions/Types:**
- Agent functions: `{adjective}Agent` (e.g., `plannerAgent`, `architectAgent`)
- Builder functions: `build{Type}Prompt` (e.g., `buildPlannerPrompt`)
- Schema exports: `{Type}Schema` and inferred type `{Type}` (e.g., `PlannerOutputSchema`, `PlannerOutput`)
- CLI commands: `{command}Command` (e.g., `runCommand`, `planCommand`)

**Variables:**
- Agent instances/functions: camelCase starting with agent name (coderInput, codeResult)
- Error results: suffix with `Result` (archResult, codeResult)
- Context objects: suffixed with Context (agentContext, projectContext)
- Typed results: `{feature}Result` (planResult, reviewResult)

## Where to Add New Code

**New Agent:**
- Implementation: `src/agents/{agentName}.ts` (copy pattern from coder.ts)
- Schema: `src/schemas/{agentName}.ts` (input/output with Zod)
- Prompt: `src/prompts/{agentName}.ts` (system + user message builder)
- Type: Add to `src/agents/types.ts` if new patterns needed
- Tests: `test/agents/{agentName}.test.ts`
- Export: Add to `src/agents/index.ts` barrel

**New Tool:**
- Implementation: `src/tools/{toolName}.ts`
- Export: Add to `src/tools/index.ts` barrel
- Usage: Import and add to ToolKit factory if filesystem-related
- Tests: `test/tools/{toolName}.test.ts`

**New CLI Command:**
- Implementation: `src/cli/commands/{commandName}.ts` (follow run.ts pattern)
- Export: Import in `src/cli/index.ts`
- CLI setup: Add `.command()` call in index.ts
- Tests: `test/cli/commands/{commandName}.test.ts` (if integration needed)

**New Schema/Type:**
- Location: `src/schemas/{domain}.ts` or `src/agents/types.ts`
- Pattern: Use Zod with `.describe()` for LLM prompt hints
- Export type via `z.infer<typeof {Name}Schema>`
- Add to `src/schemas/index.ts` barrel

**Utilities:**
- Shared helpers: `src/utils/{utilName}.ts`
- Cross-layer concerns: Consider utils folder
- Example: logging, result handling, config management

**Tests:**
- Location: Mirror source structure under `test/`
- Framework: Vitest with `*.test.ts` suffix
- Async: Use `async/await`, not callbacks
- Mocking: Vitest mocking, no external mocks

## Special Directories

**src/cli/commands/:**
- Purpose: Command handler implementations
- Generated: No
- Committed: Yes
- Pattern: Each command is standalone handler, follows CLI options type

**.agent-helper.json:**
- Purpose: User configuration file
- Generated: User creates if needed
- Committed: No (add to .gitignore)
- Schema: Defined in `src/utils/config.ts` ConfigSchema

**.qwen-agent-consent.json:**
- Purpose: Persistent consent storage
- Generated: Created by ConsentManager
- Committed: No (add to .gitignore)
- Format: JSON with consent decisions by scope

**dist/:**
- Purpose: Compiled JavaScript output
- Generated: Yes (by tsup build)
- Committed: No
- Source: All src/ files compiled to dist/

**node_modules/:**
- Purpose: Installed dependencies
- Generated: Yes (by pnpm install)
- Committed: No

## Module Organization

**Barrel Pattern:**
All feature folders export via `index.ts`:
- `src/agents/index.ts`: Exports all agents
- `src/schemas/index.ts`: Exports all schemas and types
- `src/prompts/index.ts`: Exports all prompt builders
- `src/tools/index.ts`: Exports toolkit and context utilities
- `src/utils/index.ts`: Exports utilities
- `src/llm/index.ts`: Exports LLM client factory
- `src/consent/index.ts`: Exports consent classes
- `src/orchestrator/index.ts`: Exports pipeline and staging

**Circular Dependency Prevention:**
- Agents never depend on other agents
- Orchestrator coordinates agents without agents knowing about each other
- Schemas isolated from agents (agents import schemas, not vice versa)
- Prompts depend on schemas only (for descriptions, not types)

**Type Exports:**
- Types from schemas: Always import from schemas (e.g., `import type { PlannerOutput }`)
- Context types: `src/agents/types.ts` for AgentContext
- Error types: `src/schemas/common.ts` for all error variants
- Result type: `src/utils/result.ts` Result<T, E>

---

*Structure analysis: 2026-02-13*
