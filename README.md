<div align="center">

# AgentDeck

**A desktop deck for your WSL coding agents.**

Launch, watch, and orchestrate Claude Code, Codex, Aider, four more built-in
agents — and your own custom CLIs — from a single window: split terminals,
visual workflows, and productivity + plan-limit tracking, all running through
your own WSL environment.

[![Electron](https://img.shields.io/badge/Electron-42-47848F?logo=electron&logoColor=white)](https://www.electronjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Elastic--2.0-blue)](LICENSE)
[![Status](https://img.shields.io/badge/status-personal%20%C2%B7%20actively%20developed-brightgreen)](#status)
[![CI](https://github.com/Wintersta7e/agentdeck/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Wintersta7e/agentdeck/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/Wintersta7e/agentdeck/graph/badge.svg)](https://codecov.io/gh/Wintersta7e/agentdeck)

<br>

<img src="screenshots/home-dashboard.png" alt="AgentDeck home dashboard — scope viz, daily digest, live activity, agent grid, productivity and plan limits" width="900">

</div>

---

## Why

I work across half a dozen AI coding agents, and each one is its own CLI in its
own terminal tab. Switching between Claude Code, Codex, Aider, and the rest
meant juggling windows, re-typing project paths, and losing track of which
session was doing what.

So I built AgentDeck for myself: open a project, pick an agent, and you're in a
terminal. Split the screen to run two agents side by side. Chain them into
visual workflows with conditions, loops, and variables. Keep prompt templates,
project configs, and session history in one place instead of scattered across
shells.

It's a desktop app, not a web service — your code stays local, API keys are
encrypted at rest, and everything runs through your own WSL environment with no
telemetry. It's a personal tool under Elastic-2.0: you're welcome to clone and
build it, but there's no adoption goal and no support guarantees.

## Status

Actively developed personal tool, currently at **v7.0.0**. The app is mature
and in daily use — a large Vitest suite under a zero-warning lint + typecheck
gate — but it's shaped around exactly one setup (Windows 11 + WSL2), so your
mileage outside that will vary.

**Implemented:**
- 7 built-in agents: Claude Code, Codex, Aider, Goose, Gemini CLI, Amazon Q,
  OpenCode — plus **custom agents** (bring your own CLI, e.g. a local model
  runner or a personal wrapper), first-class in the picker, palette, project
  defaults, and workflows
- Split terminal sessions (up to 3 panes) with caching, search, and live
  activity parsing
- Visual workflow engine — agent / shell / checkpoint / condition nodes,
  branching, loops, `{{VAR}}` variables, and per-run history
- Per-session git worktree isolation with a Keep / Discard review flow
- Productivity tracking (sessions · active time · files changed) for every agent,
  plus real Codex plan-limit gauges (5h / weekly), persisted across restarts
- Home dashboard — daily digest, live session grid, 7-day activity, plan limits,
  project cards
- Prompt templates, command palette, three themes

**Rough edges / not done:**
- Windows + WSL2 only — it spawns `wsl.exe`, so there's no native Linux/macOS
  build
- Real subscription plan-limit data is Codex-only (the only agent that exposes
  it on disk); every other agent shows a rolling-5h activity tile instead
- Ships as a portable `.exe` — no installer, no auto-update

**Explicitly declined (not on the roadmap):**
- Cloud sync • multi-user / team mode • telemetry or analytics • a hosted web
  version • plugin marketplace

## Features

### Terminal sessions
- Up to 3 panes side by side with draggable dividers; bare WSL shells (`Ctrl+T`)
- Sessions cached across tab switches — no re-render on return
- In-terminal search (`Ctrl+Shift+F`) with regex and case-sensitive modes
- Real-time activity parsing of agent tool use (reads, writes, commands)
- Per-session right panel: Files, Diff (Keep / Discard), Prompts, Env, Config
- New-session composer: pick an agent, drop in a prompt, set branch mode, launch

### Home dashboard
- Daily digest — session count, active time, files changed, exit rate, top agent
- Live session grid with activity pulse
- Productivity panel — sessions · active time · files changed, with a 7-day sparkline
- Plan-limits panel — real Codex 5h / weekly gauges; rolling-5h activity per agent
- Timeline + HISTORY persist across restarts (disk-backed per-session log)
- Project cards with git status; proactive suggestions; quick actions

### Workflows
- Drag-and-drop node graph: agent, shell, checkpoint, and condition nodes
- Edge-activation scheduler — ready queue, branching, skip propagation, loops
- Conditional routing on exit code or output match; per-node retry with delay
- `{{VAR}}` substitution via a typed pre-run dialog; 8 seed roles for personas
- Import / export as `.agentdeck-workflow.json`; per-run history with timings

<p align="center">
  <img src="screenshots/workflow-editor.png" width="900" alt="Workflow editor — a Bug Triage workflow with Investigate, Fix, and Regression Test agent nodes wired by step-elbow edges" />
</p>

### Projects & templates
- 5-step new-project wizard, multiple agents per project, auto stack detection
- 16 seed prompt templates across 8 categories, with a live-preview editor
- Pin favourites to the home grid

### Agents
- A single registry drives CLI flags, colour, and capabilities for all 7 built-ins
- **Custom agents (bring-your-own)** — register your own CLI (Ollama, a local
  model runner, a personal wrapper) from the Agents screen or `agents.toml`:
  binary, one-argument-per-row launch args, env, and display metadata, first-class
  across the picker, palette, project defaults, and workflow nodes
- Startup update check + one-click npm update with rollback
- Auto-detection via the WSL `PATH`

### Theming

| Theme | Vibe |
|-------|------|
| **Tungsten** (default) | Sodium amber on warm charcoal |
| **Phosphor** | Retro CRT green on ink |
| **Dusk** | Violet + coral on plum-black |

All values come from CSS custom properties in `tokens.css`; per-agent accent
tokens keep each agent's colour consistent across every theme.

## Keyboard shortcuts

| Shortcut | Action | | Shortcut | Action |
|----------|--------|---|----------|--------|
| `Ctrl+K` | Command palette | | `Ctrl+1/2/3` | Pane layout |
| `Ctrl+N` | New project | | `Ctrl++/-` | Zoom in / out |
| `Ctrl+T` | New terminal | | `Ctrl+0` | Reset zoom |
| `Ctrl+\` | Toggle right panel | | `Ctrl+Shift+F` | Search in terminal |
| `Ctrl+/` | Shortcut reference | | `Alt+1..8` | Jump to tab |

## Quick start

Requires Windows 10/11 with WSL2 (Ubuntu recommended), Node.js 22.22.1+ (see
`.nvmrc`), and at least one agent CLI installed inside WSL.

```bash
# Install (--no-bin-links is required on Windows-mounted drives)
npm install --no-bin-links

# Dev with hot reload
npm run dev

# Checks
npm run lint        # ESLint, zero warnings
npm run typecheck   # tsc on the node + web configs
npm test            # Vitest

# Build a portable .exe (gated: lint + typecheck + tests, then build + verify)
npm run release-portable
```

Output: `dist/AgentDeck-{version}-portable.exe` (~94 MB).

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Shell | [Electron 42][electron] | ConPTY; node-pty in the **main process only** |
| UI | [React 19][react] + [TypeScript 6][ts] | Strict mode, all `.ts` / `.tsx` |
| Build | [electron-vite 5][evite] | Vite for the renderer, esbuild for main/preload |
| Terminal | [xterm.js 5][xterm] + [node-pty][nodepty] | WebGL renderer over WSL PTYs |
| State | [Zustand][zustand] | One flat store composed from 8 slices |
| Workflows | [React Flow][reactflow] | Visual DAG editor |
| Storage | [electron-store][estore] | JSON on disk; `safeStorage` for secrets |
| Test / lint | [Vitest 4][vitest] + [ESLint 9][eslint] | Dual workspace, zero-warning |

## Layout

```
src/
├── main/       # Electron main: PTY, IPC, workflow engine, WSL + git, persistence
├── preload/    # contextBridge → window.agentDeck (~65 channels)
├── renderer/   # React app: terminals, workflow editor, dashboard, command palette
└── shared/     # Agent registry, domain types, workflow + id validation (no Node/DOM)
```

`WorkflowNode` is a discriminated union — `AgentNode | ShellNode | CheckpointNode
| ConditionNode` — so engine dispatch and validation stay exhaustive at compile
time. Every IPC handler that takes a caller-supplied id validates through
`shared/validation`. New themes, agents, and node types are added by extending a
single registry; the type system flags any consumer that missed the update.

## Design principles

1. **Local-first.** No web service, no account, no telemetry. Code stays on your
   machine, API keys are encrypted at rest, and fonts are bundled, not fetched.
2. **One process model, done right.** node-pty lives in the main process only;
   the renderer runs with `contextIsolation` on and `nodeIntegration` off.
3. **Single source of truth.** Agents, themes, and node types each come from one
   registry; the type system surfaces anything a new entry forgot to update.
4. **No magic numbers.** Every colour, space, font size, and duration is a
   design token in `tokens.css` — a theme is just a set of tokens.
5. **WSL-native.** Paths, git, and agent CLIs all route through your WSL distro.

## Documentation

- [User Guide](./docs/USER-GUIDE.md) — detailed usage
- [Changelog](./CHANGELOG.md) — version history
- [Contributing](./CONTRIBUTING.md) — how to contribute
- [Security](./SECURITY.md) — reporting vulnerabilities

## License

[Elastic License 2.0](./LICENSE) — free to use, modify, and share. You may not
offer it as a hosted or managed service.

---

<sub>AgentDeck is a personal tool — built for my own daily use across Windows +
WSL2, with no telemetry, analytics, or growth metrics. Not chasing adoption, but
if it looks useful you're welcome to try it.</sub>

[electron]:   https://www.electronjs.org
[react]:      https://react.dev
[ts]:         https://www.typescriptlang.org
[evite]:      https://electron-vite.org
[xterm]:      https://xtermjs.org
[nodepty]:    https://github.com/microsoft/node-pty
[zustand]:    https://zustand-demo.pmnd.rs
[reactflow]:  https://reactflow.dev
[estore]:     https://github.com/sindresorhus/electron-store
[vitest]:     https://vitest.dev
[eslint]:     https://eslint.org
