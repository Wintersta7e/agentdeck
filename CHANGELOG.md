# Changelog

All notable changes to AgentDeck will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.6.1] - 2026-03-29

### Changed
- License switched from MIT to Elastic License 2.0
- Electron 40 → 41, lucide-react 0.577 → 1.7, jsdom 28 → 29, addon-fit 0.10 → 0.11
- Bumped lint-staged, @types/node, typescript-eslint, zustand, @xyflow/react, @vitest/coverage-v8

### Added
- GitHub Actions CI workflow (lint, typecheck, format, test)
- Dependabot for weekly npm and GitHub Actions updates
- GitHub issue templates (bug report, feature request)
- Community files: CHANGELOG, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY
- Branch protection on main (require PR + CI pass)
- Private vulnerability reporting enabled

### Fixed
- brace-expansion moderate vulnerability (npm audit fix)
- SECURITY.md: replaced unreachable noreply email with GitHub private vulnerability reporting
- Sidebar CSS: templates section crushed when all sections expanded

## [4.6.0] - 2026-03-27

### Added
- Codex skill discovery — scans projects for SKILL.md files with YAML frontmatter, TTL-cached
- Project metadata refresh on IPC
- Agent updater safety: binary verification, npm bin symlink auto-repair, rollback on failure

### Fixed
- Stale package names in agent updater
- UX audit: 26/27 issues resolved (welcome card, terminal context menu, a11y, focus traps, toasts, skeleton loaders, validation, breadcrumbs, node duplication, empty states)

### Changed
- 499 tests (up from 436)

## [4.5.0] - 2026-03-25

### Added
- Conditional branching — `condition` node type with exit code and output match modes
- Loop/retry — loop-back edges with max iterations, per-node retry with configurable delay
- Workflow variables — `{{VAR}}` substitution with typed pre-run dialog
- Import/export — `.agentdeck-workflow.json` bundles with role remapping
- Workflow clone — deep copy with new UUID
- Execution history — per-run summaries with node timing, error tails, History tab
- 5 new seed workflows (12 total): Test Coverage, Dependency Update, Documentation Pass, Performance Audit, Release Prep

### Changed
- Engine rewrite: tier-based scheduler replaced with edge-activation scheduler (ready queue, pending edge counts, skip propagation, loop subgraph reset)
- God-class refactor: `appStore.ts` split into 6 Zustand slices; workflow engine split into 3 files; workflow editor split into 3 files
- ESLint tightened: `eqeqeq`, `no-console`, `no-eval`, `react-hooks/exhaustive-deps` promoted to error, `--max-warnings=0`
- TypeScript: added `noImplicitOverride`
- 436 tests (up from 348)

### Fixed
- 5 npm dependency vulnerabilities
- Codex `-C` flag and `--skip-git-repo-check` support
- WF-1 through WF-15 (signal exit codes, truncated output buffer, scheduler double-complete, loop subgraph reset bug)

## [4.4.0] - 2026-03-22

### Added
- Test coverage expansion: 293 to 348 tests across 32 files
- IPC split into 6 modules
- `terminal-utils.ts` extraction (pure functions)
- Portability fixes P1-P6

### Fixed
- TERM-12 through TERM-20 (post-refactor terminal issues)

## [4.3.0] - 2026-03-20

### Fixed
- Terminal scroll and formatting fixes (5 tasks)
- TERM-1 through TERM-11 across 3 review rounds (4-way review, 11 issues found, 9 fixed)

## [4.2.0] - 2026-03-18

### Changed
- Architecture splits: `workflow-seeds.ts`, `store-seeds.ts`, `agent-detector.ts`, `workflow-utils.ts`, `ThemeSubmenu.tsx`, `AgentsSubmenu.tsx`

### Fixed
- 59 code review fixes across 2 rounds (security, memory, performance, bugs, error handling)

## [4.1.0] - 2026-03-16

### Added
- 7 seed workflows (Codex-focused)
- 293 tests

## [4.0.0] - 2026-03-14

### Changed
- Fusion UI redesign
- Migrated all icons to Lucide React (tree-shakeable SVGs)
- Full code review: 38 fixes
- Hardened security: `sandbox: true` on BrowserWindow

### Added
- 286 tests

## [3.0.0] - 2026-03-01

### Added
- Workflow engine with visual node-graph editor
- Polymorphic tabs (sessions + workflows)
- Command palette with fuzzy search
- Terminal performance optimizations
- WSL resilience (retry, cold-boot handling)
- Bare terminal sessions
- 250 tests

## [2.0.0] - 2026-02-15

### Added
- 8 themes (4 dark + 4 light) with view transitions
- 16 seed prompt templates

## [1.0.0] - 2026-02-01

### Added
- Initial release
- Multi-agent terminal management (7 agents)
- Project management with WSL path support
- Split terminal views (1/2/3 panes)
- Terminal caching and state preservation
- Prompt template system
- electron-store persistence
