# Requirements: QwenCodingAgent

**Defined:** 2026-02-13
**Core Value:** The agent produces code that actually runs — including having the right dependencies installed.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Dependency Detection

- [ ] **DEP-01**: Agent auto-detects project package manager from lock files (pnpm-lock.yaml, package-lock.json, yarn.lock)
- [ ] **DEP-02**: Agent identifies missing imports in generated code and maps them to installable packages
- [ ] **DEP-03**: Agent categorizes dependencies as production or dev based on usage context

### Dependency Installation

- [ ] **INST-01**: Agent installs approved packages using the detected package manager
- [ ] **INST-02**: Package manager updates manifest files (package.json) and lock files automatically
- [ ] **INST-03**: Agent offers built-in alternatives when available (e.g., node:https instead of axios)
- [ ] **INST-04**: User can choose between installing a package or using the built-in alternative

### Safety

- [ ] **SAFE-01**: Agent validates package names against npm registry before installing
- [ ] **SAFE-02**: Agent rolls back to previous state if installation fails or breaks the project
- [ ] **SAFE-03**: All installations require user consent via existing consent manager

## v2 Requirements

### Multi-Language Support

- **LANG-01**: Agent detects and installs Python dependencies (pip/poetry)
- **LANG-02**: Agent detects and installs Go dependencies (go mod)
- **LANG-03**: Agent detects and installs Rust dependencies (cargo)

### Enhanced UX

- **UX-01**: Agent explains why each package is needed (file:line context)
- **UX-02**: Agent batch-installs multiple packages with single approval prompt

### Advanced Safety

- **ADV-01**: Agent integrates with npm audit for vulnerability scanning
- **ADV-02**: Version constraint intelligence (peer dependency awareness)

### Workspace Support

- **WRK-01**: Agent detects monorepo/workspace configuration
- **WRK-02**: Agent installs packages in correct workspace package

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-install without consent | Violates user control; could install malicious packages |
| Direct package.json editing | Bypasses package manager logic, breaks lock file sync |
| Global package installation | Pollutes global namespace, breaks project isolation |
| Non-Node.js ecosystems in v1 | Start focused on Node.js, expand in v2 |
| Security scanning in v1 | High complexity, external API dependencies |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEP-01 | Phase 1 | ✓ Done |
| DEP-02 | Phase 2 | Pending |
| DEP-03 | Phase 2 | Pending |
| INST-01 | Phase 1 | ✓ Done |
| INST-02 | Phase 1 | ✓ Done |
| INST-03 | Phase 3 | Pending |
| INST-04 | Phase 3 | Pending |
| SAFE-01 | Phase 2 | Pending |
| SAFE-02 | Phase 4 | Pending |
| SAFE-03 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

**Phase Distribution:**
- Phase 1 (Ecosystem Detection & Package Manager Support): 3 requirements
- Phase 2 (Dependency Analysis & Safety): 4 requirements
- Phase 3 (User Experience & Intelligent Alternatives): 2 requirements
- Phase 4 (Installation Safety & Recovery): 1 requirement

---
*Requirements defined: 2026-02-13*
*Last updated: 2026-02-13 after roadmap creation*
