# AgentDeck - Session Handoff

> **Last Updated**: 2026-03-04
> **Branch**: `main`
> **Version**: 3.7.0
> **Tests**: 182 passing (12 files)
> **Build**: `dist/AgentDeck-3.7.0-portable.exe`

## Project Overview

Electron desktop app that launches WSL agent sessions (7 agents: claude-code, codex, aider, goose, gemini-cli, amazon-q, opencode) with project management, prompt templates, split terminal views, agentic workflows, and an 8-theme design system.

## Current State

All major phases complete. App is stable and production-ready.

### Completed (all phases)

#### Phases 1-5: Foundation → v1.0.0
- [x] Skeleton + Terminal (xterm.js + node-pty + WebGL renderer)
- [x] Layout + Navigation (Titlebar, Sidebar, HomeScreen, StatusBar)
- [x] TypeScript strict + ESLint v9 + Prettier + Husky
- [x] Project Management (wizard, settings, stack detection, safeStorage)
- [x] Power Features (SplitView, CommandPalette, TemplateEditor, RightPanel)
- [x] Polish + Packaging (AboutDialog, ErrorBoundary, portable build)

#### Phase 6-8: Theming → v2.3.0
- [x] 8 themes: 4 dark (amber, cyan, violet, ice) + 4 light (parchment, fog, lavender, stone)
- [x] 19 special effects (all respect `prefers-reduced-motion: reduce`)
- [x] 16 seed templates, 8 categories, versioned seeding
- [x] Dependency upgrade: Electron 40, React 19, electron-vite 5

#### v2.3.1-v2.4.0: Bug Fixes + Polish
- [x] Phantom cursor fix, window drag, double paste, file DnD/paste, agent flags guard

#### Phase 9: Agentic Workflows → v3.0.0
- [x] Visual node-graph editor (agent/shell/checkpoint nodes)
- [x] Workflow engine: topo sort → parallel tiers, `wsl.exe` spawn
- [x] Polymorphic tabs (sessions + workflows), command palette UX

#### v3.1.0-v3.3.0: Features
- [x] Code review fixes (~50 issues), special effects v2, template expansion
- [x] Context tab + template attach, workflow roles (8 seed roles), node editor panel

#### v3.4.0: Performance Audit
- [x] Granular Zustand selectors, code splitting, react-window virtualization
- [x] Workflow engine: line-buffered stdout, NODE_INIT nvm/fnm sourcing

#### v3.5.x: Testing Infrastructure
- [x] Vitest 4.0.18, dual-project config (main=node, renderer=jsdom)
- [x] 171 tests across 11 files, pre-commit runs `--changed`

#### v3.6.0: Terminal Performance + Fixes
- [x] 15 perf fixes: WebGL renderer, PTY data batching, rAF drag, global theme observer, hidden pane buffering, zero-dim guards, fire-and-forget IPC
- [x] xterm disposal try/catch for React 19 DOM removal timing
- [x] Scrollbar visibility fix (CSS flex layout + viewport syncScrollArea after fit)
- [x] Terminal caching across tab switches (module-scope Map preserves scrollback, cursor, alternate buffer)

#### v3.7.0: HomeScreen Caching + Multi-Agent Projects
- [x] Lifted `wslUsername` and `agentStatus` into Zustand store (pre-fetched at bootstrap)
- [x] HomeScreen reads from store — instant render on re-mount, no 2-5s reload delay
- [x] WSL diagnostics run in parallel with agent binary checks
- [x] Added "Refresh" button to agent grid for manual re-detection
- [x] Multi-agent projects: `AgentConfig[]` type, backward-compatible helpers (`getDefaultAgent`, `getProjectAgents`, `migrateProjectAgents`)
- [x] Session agent overrides: `agentOverride`/`agentFlagsOverride` on Session type, preserved across restart
- [x] SplitView resolves agent from session override first, then project default
- [x] "Launch with..." right-click context menu on Sidebar and HomeScreen project cards
- [x] Agent emoji chips row on HomeScreen pinned project cards
- [x] Redesigned AgentTab: multi-select checkboxes, star default marker, per-agent expandable flags
- [x] NewProjectWizard creates `agents[]` instead of legacy `agent` field
- [x] Auto-migration of legacy single-agent projects to `agents[]` on load

### Known Issues

- [ ] ParticleField doesn't update accent color on theme change

## Key Files

```
agentdeck/
├── src/
│   ├── main/                   # Electron main process
│   │   ├── index.ts            # App lifecycle, IPC handlers
│   │   ├── pty-manager.ts      # node-pty sessions, activity parsing
│   │   ├── pty-bus.ts          # PTY event emitter (extracted)
│   │   ├── project-store.ts    # electron-store CRUD + safeStorage + legacy migration
│   │   └── wsl-utils.ts        # WSL path translation
│   ├── preload/index.ts        # contextBridge (window.agentDeck)
│   ├── renderer/
│   │   ├── store/appStore.ts   # Zustand store
│   │   ├── components/
│   │   │   ├── Terminal/TerminalPane.tsx  # xterm + terminal caching
│   │   │   ├── SplitView/               # Pane layout (1/2/3), agent resolution
│   │   │   └── WorkflowEditor/          # Node-graph editor
│   │   └── utils/themeObserver.ts        # Global theme sync
│   └── shared/
│       ├── types.ts            # Shared types (AgentConfig, Session overrides)
│       ├── agents.ts           # Agent registry (single source of truth)
│       └── agent-helpers.ts    # getDefaultAgent, getProjectAgents, migrateProjectAgents
├── docs/plans/                 # Design docs and plans
└── dist/                       # Build output
```

## Commands

```bash
cd /mnt/c/P/AgenticSandbox/agentdeck

npm run build       # Production build (validates TypeScript)
npm run dev         # Electron + Vite hot reload
npm run dist        # electron-builder → portable .exe
npm run lint        # ESLint
npm test            # Vitest (182 tests)
npm run test:watch  # Vitest watch mode
```

## Test Summary

| Module | Coverage |
|--------|----------|
| agents.ts | 100% |
| agent-helpers.ts | 100% |
| useRolesMap | 100% |
| pty-bus | 100% |
| templateUtils | 100% |
| pty-manager | ~80% |
| workflow-store | ~80% |
| project-store | ~66% |
| appStore | ~64% |
| **Total** | **182 tests, 12 files** |

## Notes for Next Session

1. **App is stable** — no pending bug fixes or blocked features
2. **Memory file** is up to date (well under 200 limit)
3. **Architecture skill** (`agentdeck-architecture-skill`) has full IPC surface, store shape, and patterns
4. **Design skill** (`agentdeck-design-skill`) has full CSS token reference
5. **Commits** — Always `Co-Authored-By: Rooty` (never Claude). Never commit CLAUDE.md.

## How to Resume

```
Continue AgentDeck development from where we left off.
See docs/plans/SESSION-HANDOFF.md for current state.
App is at v3.7.0 on main — stable, 182 tests passing. Ask what to work on next.
```
