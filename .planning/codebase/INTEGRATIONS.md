# External Integrations

**Analysis Date:** 2026-02-13

## APIs & External Services

**LLM Inference:**
- OpenAI-compatible API server - LLM text generation and structured output
  - SDK/Client: `@ai-sdk/openai` (1.0.0)
  - Configuration: `src/llm/client.ts`, `src/utils/config.ts`
  - Auth: Optional API key via `LLM_API_KEY` env var (may not be required for local servers)
  - Basepoint: `http://localhost:11434/v1` (default, configurable)
  - Supported Servers: vLLM, Ollama, OpenAI API (with appropriate baseURL)

## Data Storage

**Databases:**
- None detected - Application is stateless for code generation
- No ORM/database client dependencies

**File Storage:**
- Local filesystem only
  - Read operations: `src/tools/context.ts`, `src/tools/toolkit.ts` (read project files)
  - Write operations: `src/orchestrator/staging.ts` (stage file changes before approval)
  - Configuration file: `.agent-helper.json` in project root (optional)

**Caching:**
- None - No caching layer detected
- LLM responses are not persisted

## Authentication & Identity

**Auth Provider:**
- Custom/Optional API key authentication
  - Implementation: Optional bearer token for OpenAI-compatible API
  - Env var: `LLM_API_KEY` (passed to `@ai-sdk/openai` constructor)
  - Requirement: May be optional for local LLM servers, required for cloud providers

**Consent Management:**
- Internal consent system for user interaction
  - Location: `src/consent/` directory
  - Storage: File-based (`.agent-helper-consent.json`) via `src/consent/storage.ts`
  - Purpose: Track user approval of generated code changes

## Monitoring & Observability

**Error Tracking:**
- None detected - No external error tracking service

**Logs:**
- Console-based logging only
  - Implementation: `src/utils/logger.ts`
  - Output: stdout/stderr
  - Format: Structured JSON logs
  - No external log aggregation

## CI/CD & Deployment

**Hosting:**
- Self-hosted/local only
- No cloud platform integration detected

**CI Pipeline:**
- Supports CI mode via environment variable
  - Trigger: `CI=true` env var detected in `src/cli/commands/run.ts`
  - Behavior: Disables interactive prompts, enables automated execution
  - Use case: GitHub Actions, GitLab CI, Jenkins, etc.

## Environment Configuration

**Required env vars:**
- No environment variables are strictly required
- All have sensible defaults

**Optional env vars:**
- `LLM_BASE_URL` - Override default LLM server URL (default: `http://localhost:11434/v1`)
- `LLM_MODEL` - Override model name (default: `qwen3-coder:30b`)
- `LLM_API_KEY` - API key for OpenAI-compatible providers (default: empty string)
- `LLM_MAX_TOKENS` - Override max tokens for responses (default: 4096)
- `CI` - Enable non-interactive mode when set to `'true'`

**Secrets location:**
- `.agent-helper.json` - Local configuration file (supports LLM_API_KEY in config)
- Environment variables (recommended for secrets)
- No `.env` file pattern detected

## Webhooks & Callbacks

**Incoming:**
- None - Application is CLI-based, not a server

**Outgoing:**
- None detected - No callbacks to external services

## LLM Server Requirements

**Connectivity:**
- Must expose OpenAI-compatible `/v1/chat/completions` endpoint
- Default: `http://localhost:11434/v1`
- Error handling for connection failures: `src/llm/client.ts` detects ECONNREFUSED, timeout, and fetch failures

**Model Support:**
- Default model: `qwen3-coder:30b`
- Supports any model available on the configured LLM server
- Expected to handle structured JSON output (with Qwen3 thinking mode support)

## Import/Dependency Validation

**Restricted Imports:**
- Application validates against certain npm packages for generated code
- Location: `src/tools/importValidator.ts`
- HTTP request packages discouraged: `axios`, `node-fetch`, `got`, `request`, `superagent`
  - Recommendation: Use native `node:https` or `node:http` instead

---

*Integration audit: 2026-02-13*
