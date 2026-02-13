# Codebase Concerns

**Analysis Date:** 2026-02-13

## Tech Debt

**Import Validation Loop Complexity:**
- Issue: The import validation retry loop in `src/orchestrator/pipeline.ts` (lines 159-223) creates multiple nested async operations with redundant validation calls. The loop validates, calls coder, re-validates on each iteration, creating potential for infinite loops if the coder cannot fix imports.
- Files: `src/orchestrator/pipeline.ts`
- Impact: Performance degradation on projects with missing package imports; up to `maxImportRetries` (default 2) full coder invocations per task
- Fix approach: Consolidate validation logic; consider circuit breaker pattern to prevent infinite retries; limit total retry attempts across all phases (import + review)

**Redundant Import Extraction:**
- Issue: Import extraction happens twice per problematic change: once in `ImportValidator.validate()` (line 130) and again implicitly during coder generation
- Files: `src/tools/importValidator.ts` (lines 67-128, 130-152)
- Impact: Wasted processing on large codebases; unused regex patterns allocated repeatedly
- Fix approach: Cache extracted imports; reuse validation results across pipeline phases

**Manual Diff Generation (Not Real Unified Diff):**
- Issue: `generateDiff()` in `src/orchestrator/staging.ts` (lines 61-99) implements a naive line-by-line diff, not a real unified diff. It cannot handle file reordering and produces inaccurate diffs for large changes.
- Files: `src/orchestrator/staging.ts` (lines 61-99)
- Impact: User-facing diffs are incomplete and potentially misleading; no proper context lines
- Fix approach: Use established diff library or implement proper Longest Common Subsequence (LCS) algorithm

**Silent Error Swallowing:**
- Issue: Multiple try-catch blocks log errors but continue execution, hiding failure details from users:
  - `src/tools/context.ts` (lines 103-105): JSON parse error in package.json is silently ignored
  - `src/tools/dependencyContext.ts` (lines 25-32): Parse failure returns default constraint message
  - `src/consent/storage.ts` (lines 24-26, 34-36): File I/O errors silently return empty config
- Files: `src/tools/context.ts`, `src/tools/dependencyContext.ts`, `src/consent/storage.ts`
- Impact: Silent failures make debugging difficult; invalid package.json could cause agent to behave unexpectedly
- Fix approach: Warn users about malformed files; expose severity to logging layer; consider failing fast on critical files

**Type Safety Issues:**
- Issue: Multiple uses of `unknown` and `any` types throughout codebase without strict type validation:
  - `src/schemas/common.ts` (line 3): `unknown` type in error details
  - `src/llm/client.ts` (line 108): Error cast `as Error & { cause?: unknown; ... }`
  - `src/utils/config.ts` (line 2): `unknown` in result mapping
- Files: `src/schemas/common.ts`, `src/llm/client.ts`, `src/utils/config.ts`
- Impact: Potential runtime errors from unexpected error shapes; inconsistent error handling
- Fix approach: Define explicit error interfaces; use discriminated unions for error types

## Known Bugs

**Review Retry Logic Doesn't Reset Import Validation:**
- Symptoms: If coder produces code with invalid imports after review feedback, the import validation loop won't run again because it only runs after architect but before review (line 159-223 in pipeline.ts)
- Files: `src/orchestrator/pipeline.ts` (lines 159-223 only run once)
- Trigger: 1) Coder generates valid imports initially, 2) Reviewer gives feedback, 3) Coder retries with review feedback and introduces invalid imports - import validation won't catch this
- Workaround: Run pipeline again; import validation should run on second full pipeline execution

**Consent Manager Batch Approval Stops on First Rejection:**
- Symptoms: `checkBatchApproval()` returns immediately when first package is rejected, preventing user from seeing all packages at once
- Files: `src/consent/manager.ts` (lines 84-85)
- Trigger: Multiple missing packages requiring user approval
- Workaround: Approve packages one at a time through individual prompts

**Path Traversal Check Uses Relative Path Before Validation:**
- Symptoms: Edge case where path normalization before safety check could theoretically escape bounds
- Files: `src/tools/toolkit.ts` (lines 52-57, 68-76)
- Trigger: Complex symlink or unusual path construction
- Workaround: System works correctly in practice; risk is theoretical

## Security Considerations

**Sensitive Path Protection Has Gaps:**
- Risk: `.env` file is protected but `.env.*` files are not explicitly protected in SENSITIVE_PATHS set - only checked via wildcard pattern match
- Files: `src/tools/toolkit.ts` (lines 33-44, 59-63)
- Current mitigation: Regex pattern check in `isSensitivePath()` catches `.env` prefix
- Recommendations: Explicitly list all `.env.*` variants; add `.npmrc`, `.netrc`, other auth files to SENSITIVE_PATHS

**Console Output Not Sanitized:**
- Risk: Consent manager and CLI output error messages directly to console without escaping, could leak sensitive information from error messages
- Files: `src/consent/manager.ts` (lines 22, 31, 47, 72, 84), `src/cli/commands/run.ts` (console.log/error calls throughout)
- Current mitigation: Only logs package names and error types, not full error details in console output
- Recommendations: Sanitize error details before console output; never log file paths containing secrets; review all console.error calls for sensitive content

**LLM API Key Handling:**
- Risk: API key passed in config with default empty string, could be silently ignored instead of failing loudly
- Files: `src/llm/client.ts` (line 92): `apiKey: config.apiKey || 'not-needed'`
- Current mitigation: Works with local LLM (Ollama) which doesn't require auth
- Recommendations: Warn if apiKey is required but not provided; validate apiKey format before use

**Child Process Timeout Fixed at 60 Seconds:**
- Risk: `spawnSync()` timeout hardcoded to 60000ms with no way to override for slow operations
- Files: `src/tools/toolkit.ts` (line 202)
- Current mitigation: Timeout is reasonable for most CLI tools
- Recommendations: Make timeout configurable; allow fallback for long-running operations

## Performance Bottlenecks

**Directory Tree Generation No Depth Optimization:**
- Problem: `buildDirectoryTree()` recursively traverses entire directory structure up to `maxDirectoryDepth` but doesn't prune large directories
- Files: `src/tools/context.ts` (lines 15-64)
- Cause: `readdirSync` called for every directory; no early termination for large directory counts
- Improvement path: Skip directories with >1000 items; cache tree for duration of pipeline; add directory size limits

**Project Context Gathering is Synchronous:**
- Problem: `gatherProjectContext()` and related functions use synchronous I/O, blocking pipeline during context phase
- Files: `src/tools/context.ts`, `src/tools/dependencyContext.ts`
- Cause: Uses sync filesystem operations (`readFileSync`, `readdirSync`) instead of promises
- Improvement path: Migrate to async I/O; parallelize file reads; add timeouts for large codebases

**Import Regex Compiled on Every Validation:**
- Problem: Import extraction regex patterns created fresh on each validation call - no caching
- Files: `src/tools/importValidator.ts` (lines 76, 84, 91)
- Cause: Regex patterns not pre-compiled as static properties
- Improvement path: Move regex patterns to module level; consider single-pass import extraction

**Large File Content in Agent Messages:**
- Problem: `relevantFiles` passed to coder agent includes full file content for all modified files, no truncation
- Files: `src/orchestrator/pipeline.ts` (lines 119-127)
- Cause: Entire files read and passed; no content length limits
- Improvement path: Truncate files larger than token budget; extract only relevant sections; summarize large files

## Fragile Areas

**LLM Response Parsing Brittle to Model Changes:**
- Files: `src/llm/client.ts` (lines 25-81)
- Why fragile: `tryParseJSON()` attempts multiple heuristics to extract JSON from LLM output (handles markdown fences, `<think>` tags, balanced brace matching). If model changes output format, extraction fails silently.
- Safe modification: Add logging for extraction failures; add model-specific parsing options; test with multiple model outputs
- Test coverage: No unit tests for edge cases in JSON extraction

**Zod Validation Dependent on Exact Field Names:**
- Files: All schema files (`src/schemas/*.ts`)
- Why fragile: LLM output must match exact field names or validation fails; no flexible field name handling
- Safe modification: Use Zod transform/coerce for common variations; test with intentional field name typos
- Test coverage: Schema tests exist but don't cover LLM output variations

**Agent Retry Logic Doesn't Track Repeated Failures:**
- Files: `src/orchestrator/pipeline.ts` (lines 163-220 for import retries, 229-281 for review retries)
- Why fragile: If coder consistently produces same invalid output, import validation loop will retry `maxImportRetries` times before failing; no backoff or circuit breaker
- Safe modification: Track failure patterns; implement exponential backoff; detect repeat failures
- Test coverage: Integration tests should cover retry exhaustion scenarios

**Consent Storage JSON Parse Without Type Validation:**
- Files: `src/consent/storage.ts` (line 22-23)
- Why fragile: `JSON.parse()` followed by `ProjectConsentSchema.parse()` could fail; catch-all returns empty config
- Safe modification: Log parse failures with details; validate JSON structure before parsing
- Test coverage: No tests for corrupted consent files

## Scaling Limits

**Task Processing Sequential, Not Parallel:**
- Current capacity: Tasks processed one-at-a-time in `for` loop
- Limit: Bottleneck for multi-task requests; if one task hangs, blocks entire pipeline
- Scaling path: Parallelize task processing with Promise.all; add per-task timeout; implement task prioritization

**In-Memory Error Accumulation:**
- Current capacity: All errors collected in `errors: string[]` array without limit
- Limit: Could grow unbounded if pipeline processes many failed tasks
- Scaling path: Implement circular buffer for errors; limit error message length; stream results instead of accumulating

**No Connection Pooling for LLM Requests:**
- Current capacity: Each agent invocation creates new HTTP connection to LLM
- Limit: If pipeline has >10 agents (planner, architect, coder, reviewer per task), creates >10 connections sequentially
- Scaling path: Implement connection reuse; batch LLM requests; implement async request batching

**Directory Tree Memory Cost:**
- Current capacity: Entire directory tree built and formatted as string before use
- Limit: Large monorepos (>10k files) could create 1-10MB strings
- Scaling path: Stream directory output; implement pagination; compress tree representation

## Dependencies at Risk

**Node.js Version Requirement Strict:**
- Risk: `engines.node` requires `>=20.0.0`; no compatibility with Node 18 or 19
- Impact: Users on LTS versions < 20 cannot use tool
- Migration plan: Test with Node 18.x; add compatibility shim or backport features if needed

**AI SDK Dependency Breaking Changes:**
- Risk: `@ai-sdk/openai` and `ai` package dependencies are major versions that change frequently
- Impact: Could break on next major version bump; no lock file prevents accidental upgrades
- Migration plan: Pin exact versions in package.json; monitor changelogs; test upgrades before deploying

**Zod Validation Coupling:**
- Risk: All schemas depend on Zod v3; tight coupling to validation library
- Impact: Cannot easily swap validation libraries; Zod errors expose implementation details
- Migration plan: Create validation abstraction layer; implement custom validator interface

## Missing Critical Features

**No Undo/Rollback Mechanism:**
- Problem: Once changes are applied to filesystem, no way to undo if user realizes mistake
- Blocks: Users cannot safely experiment with agent suggestions
- Solution: Implement Git integration for auto-commit before changes; store staged changes temporarily for rollback

**No Partial Pipeline Execution:**
- Problem: Must run full planner->architect->coder->reviewer cycle for each task
- Blocks: Cannot reuse architect decisions for different coder attempts; cannot skip review
- Solution: Implement agent composition; allow config to disable phases; cache intermediate results

**No Background Processing:**
- Problem: CLI blocks on entire pipeline execution; cannot show progress or cancel mid-operation
- Blocks: Users cannot interrupt long-running operations gracefully
- Solution: Implement async task queue; add progress streaming; allow SIGINT handling during agent execution

**No Package.json Update on Import Fixes:**
- Problem: When import validation forces coder to use alternatives, doesn't install missing packages
- Blocks: Suggested fixes may reference non-installed packages; workflow incomplete
- Solution: Integrate package manager; auto-install approved packages; track installation state

## Test Coverage Gaps

**No Tests for Retry Exhaustion:**
- What's not tested: What happens when coder retries exceed `maxImportRetries` and `maxReviewRetries`
- Files: `src/orchestrator/pipeline.ts` (retry logic)
- Risk: Could silently fail or return partial results without proper error messaging
- Priority: High

**No Integration Tests for Consent Manager:**
- What's not tested: Full workflow of project-level consent persistence and session-level approval
- Files: `src/consent/manager.ts`, `src/consent/storage.ts`
- Risk: Consent decisions may not persist correctly between runs
- Priority: High

**No Tests for Large File Handling:**
- What's not tested: How system handles files >1MB, directories with >1000 entries
- Files: `src/tools/context.ts`, `src/tools/toolkit.ts`
- Risk: Performance degradation or memory issues at scale
- Priority: Medium

**No Tests for Malformed JSON in Context Files:**
- What's not tested: Behavior when package.json or consent file is corrupted/invalid
- Files: `src/tools/context.ts` (line 104), `src/consent/storage.ts` (line 24)
- Risk: Silent failures; unpredictable agent behavior with bad input
- Priority: Medium

**No Tests for LLM Response Edge Cases:**
- What's not tested: JSON extraction from models that use different thinking tags, code blocks, etc.
- Files: `src/llm/client.ts` (lines 25-81)
- Risk: Response parsing fails silently; validation errors don't propagate clearly
- Priority: Medium

---

*Concerns audit: 2026-02-13*
