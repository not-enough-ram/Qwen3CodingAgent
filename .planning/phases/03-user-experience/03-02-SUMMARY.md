---
phase: 03-user-experience
plan: 02
subsystem: orchestrator, pipeline
tags: [alternatives, pipeline-integration, consent-flow, coder-retry]
dependency_graph:
  requires: [AlternativeInfo, BatchApprovalResult, checkBatchApprovalWithAlternatives]
  provides: [pipeline-alternative-flow, alternative-coder-retry]
  affects: [src/orchestrator/pipeline.ts, test/orchestrator/pipeline.test.ts]
---

## What was built

Pipeline wired with structured alternatives flow: import validation collects AlternativeInfo from validate() results, passes structured alternatives and file context to checkBatchApprovalWithAlternatives, handles alternative selections by triggering coder retry with module replacement instructions, and skips installation for alternative-selected packages. Auto-install mode unchanged.

## Key files

### Modified
- `src/orchestrator/pipeline.ts` — Collects allAlternatives during validation, switches to checkBatchApprovalWithAlternatives, handles selectedAlternatives with coder retry feedback
- `test/orchestrator/pipeline.test.ts` — 5 new tests (15 total): alternative triggers coder retry, mixed consent results, file context passed, structured alternatives passed, auto-install bypasses alternatives

## Commits

- `334a406` feat(03-02): wire structured alternatives and file context into pipeline consent flow
- `0c4e1fc` test(03-02): add pipeline alternative selection flow tests

## Self-Check: PASSED
