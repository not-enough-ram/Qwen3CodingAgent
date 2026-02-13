# Technology Stack

**Analysis Date:** 2026-02-13

## Languages

**Primary:**
- TypeScript 5.4.0 - All source code in `src/`
- Node.js (ES2022 target) - Runtime compilation target

## Runtime

**Environment:**
- Node.js ≥20.0.0 - Required by `package.json` engines field
- ES Modules (ESM) - Configured via `"type": "module"` in `package.json`

**Package Manager:**
- pnpm - Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- ai (^4.0.0) - AI SDK for structured LLM interactions and text generation
  - Location: `src/llm/client.ts`
  - Provides: `generateText()`, structured output parsing, retry logic

**LLM Provider:**
- @ai-sdk/openai (^1.0.0) - OpenAI-compatible API client
  - Location: `src/llm/client.ts`
  - Used for: Creating model instances and API communication

**CLI:**
- commander (^12.0.0) - Command-line argument parsing
  - Location: `src/cli/index.ts`
  - Commands: run, plan, doctor

**Validation:**
- zod (^3.23.0) - TypeScript-first schema validation and parsing
  - Location: Throughout `src/schemas/`, `src/utils/config.ts`
  - Used for: Configuration validation, structured output schemas, error handling

**Testing:**
- vitest (^2.0.0) - Unit and integration test runner
  - Config: `vitest.config.ts`
  - Coverage provider: v8

**Build/Dev:**
- tsup (^8.0.0) - TypeScript bundler
  - Config: `tsup.config.ts`
  - Generates: ESM modules in `dist/`

- tsx (^4.0.0) - TypeScript execution for development
  - Used via: `pnpm dev` scripts

## Key Dependencies

**Critical:**
- ai (^4.0.0) - Enables structured LLM interactions with retry logic; core to agent decision-making
- @ai-sdk/openai (^1.0.0) - Enables communication with OpenAI-compatible LLM servers
- zod (^3.23.0) - Ensures type-safe validation of agent outputs and configuration

**Infrastructure:**
- commander (^12.0.0) - CLI framework for user interaction layer

**Dev Only:**
- @types/node (^20.0.0) - TypeScript definitions for Node.js APIs
- eslint (^9.0.0) - Code linting
- typescript (^5.4.0) - TypeScript compiler

## Configuration

**Environment:**
- Configuration file: `.agent-helper.json` (optional, auto-created with defaults)
- Environment variable overrides: `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_MAX_TOKENS`
- CI detection: `CI=true` enables non-interactive mode in `src/cli/commands/run.ts`

**Build:**
- TypeScript: `tsconfig.json` with strict mode, ES2022 target, ESM module syntax
- Bundle: `tsup.config.ts` generates both library exports and CLI binary
- Test: `vitest.config.ts` with v8 coverage, Node.js environment, globals enabled

**Runtime Compilation:**
- Source files: `src/**/*.ts`
- Build output: `dist/` (ESM format)
- CLI entry: `dist/cli/index.js` (executable via `agent-helper` binary)
- Library entry: `dist/index.js`

## Platform Requirements

**Development:**
- Node.js 20.0.0 or higher
- pnpm package manager
- TypeScript 5.4+
- ESM-compatible environment

**Production:**
- Node.js 20.0.0 or higher (runtime target)
- External LLM server: vLLM, Ollama, or OpenAI-compatible API
- Network connectivity to LLM baseURL (default: `http://localhost:11434/v1`)

**Deployment Target:**
- Standalone CLI tool (npm-installable)
- Node.js application server
- Local development machine with LLM server
- CI/CD pipelines (supports `--non-interactive` flag)

---

*Stack analysis: 2026-02-13*
