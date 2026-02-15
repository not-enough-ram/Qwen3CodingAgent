---
phase: 03-user-experience
plan: 01
subsystem: tools, consent
tags: [alternatives, substitution-map, consent-ux, file-context]
dependency_graph:
  requires: []
  provides: [AlternativeInfo, BatchApprovalResult, checkBatchApprovalWithAlternatives]
  affects: [src/tools/importValidator.ts, src/consent/prompter.ts, src/consent/manager.ts]
---

## What was built

Structured alternatives system: SUBSTITUTION_MAP upgraded from plain strings to AlternativeInfo objects (19 entries) with description, module, example, and minNodeVersion. ConsentPrompter enhanced to display built-in alternatives with code examples and file context. ConsentManager gets checkBatchApprovalWithAlternatives() returning BatchApprovalResult with approved/alternatives/rejected separation.

## Key files

### Modified
- `src/tools/importValidator.ts` — AlternativeInfo type, exported SUBSTITUTION_MAP (19 entries), getAlternative() method, validate() returns alternatives Map
- `src/consent/prompter.ts` — ConsentPromptOptions gets alternatives and fileContext fields, structured alternative display with examples, approved:false for alternative selection
- `src/consent/manager.ts` — BatchApprovalResult type, checkBatchApprovalWithAlternatives() with structured alt/fileContext pass-through
- `src/consent/index.ts` — Re-exports BatchApprovalResult
- `test/tools/importValidator.test.ts` — 5 new tests (24 total)
- `test/consent/prompter.test.ts` — 2 new tests (4 total)
- `test/consent/manager.test.ts` — 6 new tests (19 total)

## Commits

- `22f9927` feat(03-01): upgrade SUBSTITUTION_MAP to structured AlternativeInfo
- `f837195` feat(03-01): enhance ConsentPrompter with structured alternatives and file context
- `0101c8e` feat(03-01): add checkBatchApprovalWithAlternatives to ConsentManager

## Self-Check: PASSED
