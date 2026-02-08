# Agent Helper

A multi-agent LLM coding assistant that orchestrates specialized AI agents to help with software development tasks. Designed to work with local LLMs via an OpenAI-compatible API.

## Features

- **Multi-agent pipeline**: Planner, Architect, Coder, and Reviewer agents work together
- **Local LLM support**: Works with vLLM, Ollama, or any OpenAI-compatible server
- **Structured output**: Zod schemas ensure reliable JSON parsing with automatic retries
- **Review loop**: Code is validated and iteratively improved before applying
- **Interactive CLI**: Preview changes, view diffs, and approve before applying

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd agent-helper

# Install dependencies
pnpm install

# Build the project
pnpm build
```

## Quick Start

1. **Start your local LLM server** (e.g., vLLM, Ollama)

2. **Check connectivity**:
   ```bash
   pnpm dev doctor
   ```

3. **Run a task**:
   ```bash
   pnpm dev run "Add a user authentication system with JWT"
   ```

4. **Preview a plan without executing**:
   ```bash
   pnpm dev plan "Refactor the database layer"
   ```

## Configuration

### Environment Variables

```bash
LLM_BASE_URL=http://localhost:11434/v1  # LLM server URL
LLM_MODEL=qwen3-coder-next              # Model name
LLM_API_KEY=                            # API key (if required)
LLM_MAX_TOKENS=4096                     # Max tokens per request
```

### Config File

Create `.agent-helper.json` in your project root:

```json
{
  "llm": {
    "baseUrl": "http://localhost:11434/v1",
    "model": "qwen3-coder-next",
    "apiKey": "",
    "maxTokens": 4096,
    "temperature": 0.2
  },
  "pipeline": {
    "maxReviewRetries": 2,
    "maxSchemaRetries": 3,
    "applyChangesAutomatically": false
  },
  "context": {
    "maxFileSize": 10000,
    "maxDirectoryDepth": 3,
    "ignorePatterns": ["node_modules", ".git", "dist", "build"]
  }
}
```

## CLI Commands

### `run <request>`

Execute a development task with the full agent pipeline.

```bash
pnpm dev run "Add user authentication with JWT"
pnpm dev run "Fix the broken tests" --project ./my-app
pnpm dev run "Add dark mode" --yes  # Auto-apply changes
pnpm dev run "Refactor utils" --verbose  # Debug logging
```

Options:
- `-p, --project <path>`: Project directory (default: current directory)
- `-y, --yes`: Apply changes automatically without prompting
- `-v, --verbose`: Enable debug logging

### `plan <request>`

Dry run that shows the task breakdown and file plan without executing.

```bash
pnpm dev plan "Add a REST API for users"
```

### `doctor`

Check LLM connectivity and configuration.

```bash
pnpm dev doctor
```

## Architecture

### Agent Pipeline

```
User Request
    │
    ▼
 Planner ──→ Task List
    │
    ▼ (for each task)
 Architect ──→ File Plan
    │
    ▼
 Coder ──→ Code Changes
    │
    ▼
 Reviewer ──→ Pass? ──yes──→ Apply Changes
    │                          │
    no                         ▼
    │                     Next Task
    ▼
 Coder (retry with feedback, max 2 retries)
```

### Agents

| Agent | Purpose |
|-------|---------|
| **Planner** | Breaks down requests into ordered tasks with dependencies |
| **Architect** | Creates file-level plans for each task |
| **Coder** | Generates or modifies code based on the plan |
| **Reviewer** | Validates code against requirements, provides feedback |

### Project Structure

```
src/
├── agents/         # Agent implementations
├── cli/            # CLI commands
├── llm/            # LLM client with structured output
├── orchestrator/   # Pipeline and change staging
├── prompts/        # Prompt templates
├── schemas/        # Zod schemas for agent I/O
├── tools/          # File system and project context
└── utils/          # Result type, logger, config
```

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev <command>

# Type check
pnpm typecheck

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Build
pnpm build

# Lint
pnpm lint
```

## Design Principles

1. **Agents are functions, not classes**: Each agent is a pure async function
2. **Orchestrator owns control flow**: Agents never call other agents
3. **Structured I/O with Zod**: All agent communication uses validated JSON
4. **No streaming between agents**: Only final output streams to user
5. **Tools are injected**: File/shell access via dependency injection

## Local LLM Tips

- Keep prompts under ~4k tokens for best results
- The system uses explicit JSON schemas and examples for reliability
- Failed JSON parsing triggers automatic retries with error context
- Temperature 0.2 recommended for consistent structured output

## License

MIT
