# AgentDeck - Session Handoff

> **Last Updated**: 2026-03-05
> **Branch**: `main`
> **Version**: 3.9.0 (package.json still reads 3.7.0 — needs bump)
> **Tests**: 223 passing (14 files)
> **Build**: `dist/AgentDeck-3.7.0-portable.exe` ready for user testing

## Project Overview

Electron desktop app that launches WSL agent sessions (7 agents: claude-code, codex, aider, goose, gemini-cli, amazon-q, opencode) with project management, prompt templates, split terminal views, agentic workflows, and an 8-theme design system.

## Current State

All major phases complete. This session added agent update notifications, fixed several WSL issues, and cleaned up the HomeScreen.

### Completed (all phases)

#### Phases 1-5: Foundation -> v1.0.0
- [x] Skeleton + Terminal (xterm.js + node-pty + WebGL renderer)
- [x] Layout + Navigation (Titlebar, Sidebar, HomeScreen, StatusBar)
- [x] TypeScript strict + ESLint v9 + Prettier + Husky
- [x] Project Management (wizard, settings, stack detection, safeStorage)
- [x] Power Features (SplitView, CommandPalette, TemplateEditor, RightPanel)
- [x] Polish + Packaging (AboutDialog, ErrorBoundary, portable build)

#### Phase 6-8: Theming -> v2.3.0
- [x] 8 themes: 4 dark (amber, cyan, violet, ice) + 4 light (parchment, fog, lavender, stone)
- [x] 19 special effects (all respect `prefers-reduced-motion: reduce`)
- [x] 16 seed templates, 8 categories, versioned seeding
- [x] Dependency upgrade: Electron 40, React 19, electron-vite 5

#### v2.3.1-v2.4.0: Bug Fixes + Polish
- [x] Phantom cursor fix, window drag, double paste, file DnD/paste, agent flags guard

#### Phase 9: Agentic Workflows -> v3.0.0
- [x] Visual node-graph editor (agent/shell/checkpoint nodes)
- [x] Workflow engine: topo sort -> parallel tiers, `wsl.exe` spawn
- [x] Polymorphic tabs (sessions + workflows), command palette UX

#### v3.1.0-v3.6.0: Features + Performance
- [x] Code review fixes (~50 issues), special effects v2, template expansion
- [x] Context tab + template attach, workflow roles (8 seed roles), node editor panel
- [x] Performance audit (Zustand selectors, code splitting, react-window)
- [x] Testing infrastructure (Vitest 4.0.18, dual-project config)
- [x] Terminal performance (15 fixes), terminal caching across tab switches

#### v3.7.0: HomeScreen Caching + Multi-Agent Projects
- [x] `wslUsername`/`agentStatus` in Zustand store (instant HomeScreen render)
- [x] Multi-agent projects: `AgentConfig[]`, "Launch with..." context menu, agent chips
- [x] Auto-migration of legacy single-agent projects to `agents[]` on load

#### v3.8.0: Terminal Search + Workflow Audit
- [x] Terminal search (Ctrl+Shift+F, TerminalSearchBar, 18 tests)
- [x] `@xterm/addon-unicode11` for emoji/CJK rendering
- [x] Scrollback wired from project settings to Terminal
- [x] Workflow audit: 38 issues found, 24 fixed (6 critical, 8 high, 8 medium)
- [x] Code review: 16 fixes + v3.7.0 review fixes

#### v3.9.0 (this session): Agent Updates + HomeScreen Cleanup

**Agent Update Notifications (8 commits)**
- [x] `agent-updater.ts` — version checking + updating via WSL (12 tests)
- [x] `agents.ts` — added `versionArgs`, `latestCmd`, `updateCmd`, `installedCmd` per agent
- [x] IPC: `agents:checkUpdates` (fire-and-forget), `agents:update`, `agents:versionInfo` listener
- [x] Zustand: `agentVersions` map with per-agent current/latest/updateAvailable/checking/updating
- [x] HomeScreen: version display + "Update" button on agent cards (accent when available)
- [x] Startup: parallel non-blocking version checks, toast on updates found
- [x] Codex fix: `installedCmd` uses `npm list -g` (Windows PATH leaks wrong binary)
- [x] WSL stderr tolerance: `runWslCmd` returns stdout even on non-zero exit if data present

**Bug Fixes (2 commits)**
- [x] WSL username: fallback chain (`bash -lc whoami` -> `whoami` -> `echo $USER`)
- [x] Codex update: `fnm: command not found` stderr no longer breaks update

**HomeScreen Cleanup (1 commit)**
- [x] Removed redundant "Recent" section (pinned projects + sidebar sufficient)

### Deferred Items

#### Workflow Features (Low Priority)
- [ ] L1: Undo/redo for workflow edits
- [ ] L3: Node duplication (right-click "Duplicate")
- [ ] L4: Search/filter within execution logs
- [ ] L6: Workflow dirty flag / unsaved indicator
- [ ] L7: Execution state persistence across app restarts

#### Testing Gaps (require integration infrastructure)
- [ ] T2: Checkpoint pause/resume integration tests
- [ ] T3: Concurrent workflow execution tests
- [ ] T4: Role persona injection tests
- [ ] T5: Error scenario tests (agent crash, shell timeout)

### Known Issues
- [ ] ParticleField doesn't update accent color on theme change
- [ ] Version in package.json still says 3.7.0 (needs bump to 3.9.0)

## Key Files

```
agentdeck/
├── src/
│   ├── main/
│   │   ├── index.ts                # App lifecycle, IPC handlers, WSL username fallback
│   │   ├── agent-updater.ts        # Version check/update via WSL (runWslCmd, NODE_INIT)
│   │   ├── agent-updater.test.ts   # 12 tests (version check, update, stderr tolerance)
│   │   ├── pty-manager.ts          # node-pty sessions, activity parsing
│   │   ├── workflow-engine.ts      # Timeout, concurrency, edge validation
│   │   ├── workflow-store.ts       # Atomic writes, write locks, save validation
│   │   └── project-store.ts       # electron-store CRUD + safeStorage + legacy migration
│   ├── preload/
│   │   └── index.ts               # contextBridge: agents.checkUpdates/update/onVersionInfo
│   ├── renderer/
│   │   ├── global.d.ts            # Window.agentDeck type (must match preload surface)
│   │   ├── main.tsx               # Bootstrap: subscribe versionInfo, fire checkUpdates
│   │   ├── store/appStore.ts      # agentVersions, setAgentVersion, setAgentUpdating
│   │   ├── components/HomeScreen/
│   │   │   ├── HomeScreen.tsx      # Pinned grid + agent grid (no more Recent section)
│   │   │   └── HomeScreen.css
│   │   ├── components/Terminal/
│   │   │   ├── TerminalPane.tsx    # Search + unicode + scrollback integration
│   │   │   └── TerminalSearchBar.tsx
│   │   └── screens/WorkflowEditor/
│   └── shared/
│       ├── agents.ts              # 7 agents with version/update metadata + installedCmd
│       ├── types.ts
│       └── agent-helpers.ts       # Frozen FALLBACK, legacy field cleanup
├── docs/plans/
│   ├── 2026-03-05-agent-update-toast-design.md
│   ├── 2026-03-05-agent-update-toast.md
│   ├── 2026-03-05-workflow-audit-issues.md
│   └── SESSION-HANDOFF.md
└── dist/AgentDeck-3.7.0-portable.exe
```

## Commands

```bash
cd /mnt/c/P/AgenticSandbox/agentdeck

npm run build       # Production build (validates TypeScript)
npm run dev         # Electron + Vite hot reload
npm run dist        # electron-builder -> portable .exe
npm run lint        # ESLint
npm test            # Vitest (223 tests)
npm run test:watch  # Vitest watch mode
```

## Test Summary

| Module | Tests |
|--------|-------|
| workflow-engine | 44 |
| agents | 28 |
| appStore | 27 |
| TerminalSearchBar | 18 |
| agent-helpers | 17 |
| pty-manager | 16 |
| project-store | 14 |
| agent-updater | 12 |
| templateUtils | 12 |
| workflow-store | 10 |
| pty-bus | 9 |
| detect-stack | 8 |
| useRolesMap | 4 |
| activity parsing | 4 |
| **Total** | **223** |

## Notes for Next Session

1. **Version bump needed** — package.json still says 3.7.0, should be 3.9.0
2. **User testing agent updates** — toast notifications at startup, per-agent update buttons on HomeScreen
3. **Codex PATH gotcha** — Windows `codex-cli` binary leaks into WSL PATH. Agent uses `installedCmd` (npm list) to avoid.
4. **WSL stderr tolerance** — `runWslCmd()` in `agent-updater.ts` returns stdout even on non-zero exit if stdout has data. Key pattern for any future WSL commands.
5. **global.d.ts must match preload** — pre-commit hook typechecks ALL source files; adding IPC methods to preload without updating `global.d.ts` blocks commits
6. **Deferred workflow features** — L1 (undo/redo), L3 (duplication), L4 (log search), L6 (dirty flag), L7 (persistence) in audit doc
7. **Architecture/design skills** available: `agentdeck-architecture-skill`, `agentdeck-design-skill`, `agentdeck-wsl-pty-skill`
8. **Commits** — Always `Co-Authored-By: Rooty` (never Claude). Never commit CLAUDE.md.

## How to Resume

```
Continue AgentDeck development from where we left off.
See docs/plans/SESSION-HANDOFF.md for current state.
App is at v3.9.0 on main — 223 tests passing, portable exe built.
Recent section removed from HomeScreen. Agent update notifications working.
Ask what to work on next.
```
