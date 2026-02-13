# Architecture

**Analysis Date:** 2026-02-13

## Pattern Overview

**Overall:** Multi-agent LLM orchestration pipeline with specialized agents coordinating development tasks.

**Key Characteristics:**
- Sequential agent processing with structured I/O validation
- Feedback loops for quality improvement (import validation, code review)
- Result-based error handling without exceptions
- Modular agent composition with shared context and tooling

## Layers

**CLI Layer:**
- Purpose: User-facing command interface for executing requests and managing consent
- Location: `src/cli/` (commands: `run.ts`, `plan.ts`, `doctor.ts`)
- Contains: Command routing, user interaction, change staging/application
- Depends on: Orchestrator, Config, ConsentManager, ToolKit
- Used by: Direct user invocation via npm/cli

**Orchestration Layer:**
- Purpose: Coordinates multi-agent pipeline and retry logic
- Location: `src/orchestrator/pipeline.ts`, `staging.ts`
- Contains: Pipeline execution, task processing loop, error collection
- Depends on: All agents, tools, schemas, consent manager
- Used by: CLI commands

**Agent Layer:**
- Purpose: Specialized LLM-based agents with defined input/output contracts
- Location: `src/agents/`
- Contains: `planner.ts`, `architect.ts`, `coder.ts`, `reviewer.ts`
- Depends on: LLM client, schemas, prompts
- Used by: Pipeline orchestrator

**Prompt Layer:**
- Purpose: Constructs system/user prompts with project context
- Location: `src/prompts/`
- Contains: `planner.ts`, `architect.ts`, `coder.ts`, `reviewer.ts`
- Depends on: Types, schemas
- Used by: Agents to build LLM messages

**Schema Layer:**
- Purpose: Type-safe input/output contracts using Zod
- Location: `src/schemas/`
- Contains: `common.ts` (error types), `planner.ts`, `architect.ts`, `coder.ts`, `reviewer.ts`
- Depends on: Zod
- Used by: Agents for validation, prompts for instruction

**LLM Layer:**
- Purpose: OpenAI-compatible LLM client with structured output support
- Location: `src/llm/client.ts`
- Contains: Text generation, structured generation with retry logic, JSON parsing
- Depends on: @ai-sdk/openai, Zod
- Used by: All agents

**Tools Layer:**
- Purpose: Safe file system and command execution with guards
- Location: `src/tools/`
- Contains: `toolkit.ts` (file/command access), `context.ts` (project analysis), `dependencyContext.ts`, `importValidator.ts`
- Depends on: Node.js fs/child_process
- Used by: Orchestrator, staging

**Consent Layer:**
- Purpose: User consent management for package installations and file changes
- Location: `src/consent/`
- Contains: `manager.ts`, `prompter.ts`, `storage.ts`, `schema.ts`
- Depends on: ToolKit, Logger
- Used by: Pipeline with import validation

**Configuration Layer:**
- Purpose: Load and merge LLM, pipeline, and context configurations
- Location: `src/utils/config.ts`
- Contains: Schema-validated config loading from file + env overrides
- Depends on: Zod
- Used by: CLI, Pipeline, LLM client

**Utilities:**
- Purpose: Cross-cutting concerns
- Location: `src/utils/`
- Contains: `result.ts` (Result type), `logger.ts` (scoped logging), `config.ts`
- Used by: All layers

## Data Flow

**Full Pipeline Flow:**

1. **User Request Entry** (`cli/run.ts`)
   - Load config (file + env overrides)
   - Create LLM client, ToolKit, ConsentManager
   - Invoke `runPipeline(request, options)`

2. **Planner Phase**
   - Input: User request + project context (gathered by `tools/context.ts`)
   - LLM prompt built by `prompts/planner.ts`
   - Output: Tasks array with dependencies and file estimates
   - Validation: `schemas/planner.ts` PlannerOutputSchema

3. **Per-Task Loop** (for each task)

   **3a. Architect Phase**
   - Input: Task description + project context
   - Prompt: `prompts/architect.ts`
   - Output: File operations list (create/modify/delete) with reasoning
   - Validation: `schemas/architect.ts` ArchitectOutputSchema

   **3b. File Content Gathering**
   - Read existing files from disk via ToolKit
   - Pass relevant content to next phase

   **3c. Coder Phase (with retry loop)**
   - Input: Task, architect plan, relevant files, feedback (import/review)
   - Prompt: `prompts/coder.ts` (injected with dependencyContext)
   - Output: FileChange array with content and optional diffs
   - Validation: `schemas/coder.ts` CoderOutputSchema
   - Retry triggers:
     - Import validation failure → re-run with rejected packages list
     - Review failure → re-run with review issues

   **3d. Import Validation Loop** (if enabled)
   - Validate imports in generated code against project dependencies
   - Consent-aware validation (checks ConsentManager)
   - If missing packages: collect suggestions, feed back to coder, retry

   **3e. Review Phase (with retry loop)**
   - Input: Original request, task, file changes, project dependencies
   - Prompt: `prompts/reviewer.ts`
   - Output: Pass/fail boolean + issues array
   - Validation: `schemas/reviewer.ts` ReviewerOutputSchema
   - Retry: If failed, re-run coder with review feedback (up to maxReviewRetries)

4. **Staging & Application** (`orchestrator/staging.ts`)
   - Stage changes (detect new vs modified files)
   - User prompt for confirmation (unless --yes flag)
   - Show diff if requested
   - Apply changes via ToolKit.writeFile

**Error Handling:**
- Each step returns `Result<T, E>` type (ok/error union)
- Errors collected and returned, not thrown
- Agent errors marked as retryable or non-retryable
- Pipeline continues for remaining tasks even if one fails

**State Management:**
- Immutable: All agent outputs treated as new data
- Conversation ID: UUID generated per pipeline run, passed to all agents for tracing
- Context: AgentContext carries LLM, tools, logger, conversationId to each agent

## Key Abstractions

**Result Type:**
- Purpose: Type-safe error handling without exceptions
- Examples: `src/utils/result.ts` defines Result<T, E> union
- Pattern: All async functions return Result, checked with `.ok` discriminant
- Usage: Composable with map, flatMap, all combinators

**AgentContext:**
- Purpose: Dependency injection for agents
- Examples: `src/agents/types.ts` AgentContext type
- Pattern: Created in pipeline, passed to each agent, carries LLM/tools/logger
- Usage: Agents receive typed context, no globals

**Schemas with Zod:**
- Purpose: Runtime validation + TypeScript inference
- Examples: `src/schemas/planner.ts`, `architect.ts`, `coder.ts`, `reviewer.ts`
- Pattern: Define schema with descriptions, export inferred types
- Usage: Agent LLM outputs validated against schema, type-safe throughout

**ToolKit Abstraction:**
- Purpose: Sandboxed file system and command access
- Examples: `src/tools/toolkit.ts` createToolKit(projectRoot)
- Pattern: All paths relative to project root, validated for safety
- Usage: File read/write, directory listing, command execution with whitelisting

**Prompt Builders:**
- Purpose: Compose system + user messages with context injection
- Examples: `src/prompts/*.ts` buildXxxPrompt() functions
- Pattern: Take parameters, return Message[] array
- Usage: Called by agents before LLM.generateStructured()

## Entry Points

**CLI Entry:**
- Location: `src/cli/index.ts` (shebang bin)
- Triggers: `npm run dev` or installed binary `agent-helper`
- Responsibilities: Parse commands (run/plan/doctor), dispatch to command handlers

**Run Command:**
- Location: `src/cli/commands/run.ts` runCommand()
- Triggers: `agent-helper run "<request>"`
- Responsibilities: Config loading, pipeline execution, change application, user prompts

**Plan Command:**
- Location: `src/cli/commands/plan.ts` planCommand()
- Triggers: `agent-helper plan "<request>"`
- Responsibilities: Pipeline execution (dry run), print tasks and changes

**Doctor Command:**
- Location: `src/cli/commands/doctor.ts` doctorCommand()
- Triggers: `agent-helper doctor`
- Responsibilities: LLM connectivity check

**Pipeline Entry:**
- Location: `src/orchestrator/pipeline.ts` runPipeline()
- Called by: CLI commands via async orchestration
- Responsibilities: Multi-agent orchestration, task processing, error collection

## Error Handling

**Strategy:** Result-based error handling with retryable classification

**Patterns:**

- **LLM Errors** (`schemas/common.ts` LLMError)
  - Types: connection, timeout, rate_limit, invalid_response, schema_validation
  - Connection errors: Not retried in structured generation
  - Schema errors: Retried up to maxRetries with error feedback appended

- **Tool Errors** (ToolError)
  - Types: not_found, permission_denied, invalid_path, execution_failed, timeout
  - Path traversal validation: All paths must be within project root
  - Sensitive paths protected: .env, .git, package-lock.json, etc.

- **Agent Errors** (AgentError)
  - Type discriminant with retryable flag
  - Logged with context (taskId, attemptCount)
  - Pipeline skips task on non-retryable errors

- **Pipeline Error Collection**
  - Errors accumulated in array, not thrown
  - All tasks processed even if some fail
  - Final result includes success boolean and errors list

## Cross-Cutting Concerns

**Logging:**
- Framework: Custom logger in `src/utils/logger.ts`
- Approach: Scoped loggers with timestamp, level, scope, data fields
- JSON or human-readable output based on config
- Each agent gets `logger.child(agentName)` for scope prefix

**Validation:**
- Framework: Zod throughout
- Points: Config loading, agent schemas, prompt outputs
- Errors converted to structured AgentError/LLMError

**Authentication:**
- LLM: API key from config or env (LLM_API_KEY)
- File system: No auth, assumes safe project directory
- Packages: Consent-based (ConsentManager) for installs

**Project Context Gathering:**
- Implemented in `src/tools/context.ts`
- Reads package.json (deps, devDeps, name, language)
- Detects framework (Next.js, Express, React, Vue)
- Builds directory tree (configurable depth, ignores patterns)
- Reads README for additional context
- Formatted for LLM consumption

---

*Architecture analysis: 2026-02-13*
