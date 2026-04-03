# Changelog

All notable changes to AgentDeck will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.8.2] - 2026-04-01

### Fixed
- Cost tracking silently broken for all sessions — `$HOME` inside single quotes prevented bash expansion; discovery always timed out (R4-01)
- Workflow deadlock reported as false success — engine now detects unreachable nodes after upstream failure and reports error (R2-01)
- Startup commands joined with `&&` silently prevented agent launch on any setup failure — changed to `; ` (BUG-1)
- Implicit PTY exit force-discarded isolated worktrees — now uses `keep` to prevent data loss (CDX-4)
- Project deletion with active sessions orphaned worktrees — now kills sessions first (BUG-4)
- Loop counter reset affected sibling loop edges from the same condition node (BUG-5/CDX-5)
- Agent updater `repairNpmBinLink` hardcoded `.js` suffix — now derives entry from package.json (BUG-2)
- Post-kill PTY data emission on ptyBus — added sessions.has guard (BUG-6)
- `restartSession` leaked `sessionUsage` entries in Zustand store (LEAK-13)
- Copy flash setTimeout not cancelled on terminal unmount (LEAK-10)
- Timer TOCTOU race in CostTracker on unbind during async callback (R2-02)
- Orphan worktree pruning leaked registry entries for manually-deleted directories (R2-25)
- SplitView pulse timers not reset on pane layout change (BUG-8)
- Workflow rename non-atomic — now reverts optimistic update on IPC failure (BUG-9)

### Security
- IPC validation: SAFE_ID_RE applied consistently across all 53 IPC channels (was duplicated in 4 files, 12 handlers missing checks)
- Shell injection: `shellQuote` for agent updater node -e script (SEC-31) and `isBinaryOnPath` (R2-03)
- Path traversal: backslash normalization in `projects:readFile` guard (SEC-34)
- Renderer log data bounded to 4KB to prevent log exhaustion (SEC-33)
- `agentFlags` type/length validation in `pty:spawn` (R2-21)
- `cost:bind` validates `spawnAt` as finite number (R2-23)
- Missing `--` separator in wsl.exe calls fixed in cost-tracker and index.ts (R2-20, R5-02)

### Performance
- Titlebar uses narrow serialized session selector (prevents re-renders at PTY data rate)
- `listWorkflows` reads files concurrently via Promise.all (was sequential)
- `pruneRuns` sorts by filename timestamp instead of calling stat() on each file
- Worktree registry I/O converted from synchronous to async (unblocks main process)
- Edge-scheduler `isDone()` is O(1) via activeCount tracking (was O(n) scan)
- HomeScreen uses Map for O(1) agent metadata lookup (was O(n) find per chip)
- Cached accent RGB in themeObserver to avoid getComputedStyle per terminal on theme change
- Static AmbientGlow position arrays hoisted to module scope (prevents new refs on render)

### Changed
- Shared `validation.ts` module — single source of truth for SAFE_ID_RE
- `paneSessions` capped at 3 entries to prevent unbounded growth
- Silent `.catch(() => {})` on `cost.unbind` replaced with debug logging
- `.some()` test assertions replaced with `toContainEqual` for actionable failures
- Vite HMR cleanup for version info IPC listener (dev-only leak fix)
- Cache invalidation no longer deletes in-flight scan promises (prevents stale overwrite race)
- Empty workflows rejected with error event instead of persisting 0ms run records
- 611 tests (all passing), 0 lint warnings

## [4.8.0] - 2026-03-30

### Added
- Cost/token tracking for Claude Code and Codex CLI sessions (PR #20)
  - Log adapters parse JSONL session logs with per-model pricing maps
  - CostTracker discovers log files via WSL, tails on 3s poll, pushes usage over IPC
  - Cost badge in PaneTopbar: Zap icon + USD cost + total processed tokens (accent-colored)
  - Tooltip shows per-type breakdown (input, output, cache read, cache write)
  - Claude pricing: opus/sonnet/haiku tiers with cache write 1.25x and cache read 0.1x rates
  - Codex pricing: per-model map (gpt-4o, o3, o4-mini, gpt-5.3/5.4, codex-mini)
- Git worktree isolation for per-session branches (PR #19)
  - GitPort abstraction + WslGitPort implementation
  - WorktreeManager: acquire/inspect/discard/keep/releasePrimary/pruneOrphans
  - Branch badge in PaneTopbar, worktree indicator in StatusBar
  - Close flow with inspect + ConfirmDialog (Keep/Discard/Cancel)

### Fixed
- Claude adapter: skip streaming partials (stop_reason: null) to prevent double-counting
- Claude adapter: compute cost from model pricing (JSONL has no costUSD field)
- Codex adapter: normalize input_tokens by subtracting cached_input_tokens (was showing inflated 12k for simple prompts)
- Codex adapter: parse real JSONL format (payload.info.total_token_usage, not payload directly)
- Cost badge: show total processed tokens consistent with cost (no mismatch between $0.18 and "87 tokens")
- Windows paths converted to WSL format before log file discovery
- Session agent override shown in PaneTopbar (was showing project default)

### Changed
- 614 tests (up from 511)

## [4.7.0] - 2026-03-29

### Added
- Keyboard tab cycling: Ctrl+Tab / Ctrl+Shift+Tab
- ConfirmDialog component for destructive actions (project/workflow deletion)
- IPC error-to-notification middleware with user-friendly messages (12 new tests)
- Workflow state hydration — renderer recovers running workflow status after reload
- WSL health status banner — red warning when WSL is not detected
- PTY spawn failure now shows error message in terminal instead of blank screen
- Suspense spinner fallback for lazy-loaded screens
- Agent install guidance tooltips for missing agents
- Empty sidebar section hints (pinned, templates, workflows)
- Sidebar path tooltips on hover
- Workflow load failure error state
- Resource limits: max 20 PTY sessions, max 3 concurrent workflow runs
- Default 30-minute absolute timeout on agent nodes
- safeStorage unavailability warning toast
- Process cleanup handlers (uncaughtException, unhandledRejection)
- CSP enforced via onHeadersReceived header (in addition to meta tag)
- Smart Settings command palette action (resolves active project, disabled state)

### Fixed
- Accessibility: prefers-reduced-motion support (targeted, preserves ambient effects)
- Accessibility: keyboard support on all interactive div elements (role, tabIndex, onKeyDown)
- Accessibility: ARIA landmark/widget roles across sidebar, tab bars, status bar, toasts
- Accessibility: visible focus indicators (:focus-visible)
- Accessibility: WCAG AA color contrast on all 4 light themes (--text3 darkened)
- Security: shellQuote for project paths in pty-manager (was double-quote interpolation)
- Security: sessionId validation in pty:spawn handler
- Security: block all navigation in will-navigate (was only blocking file://)
- Reliability: async WSL check (was blocking main process up to 10s)
- Reliability: electron-store write lock prevents concurrent save races
- Reliability: workflowEngine.stopAll() on renderer crash and window close
- Reliability: WSL distro fallback warning log
- UX: tab bar horizontal scroll on overflow
- UX: quick-open bar opens command palette instead of wizard
- UX: replaced window.confirm with custom ConfirmDialog

### Changed
- 511 tests (up from 499)

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
