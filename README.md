# AgentDeck

A desktop command center for managing multiple AI coding agent sessions in WSL2. Launch, monitor, and orchestrate agents like Claude Code, Aider, Codex, and more — all from one window.

![Electron](https://img.shields.io/badge/Electron-40-47848F?logo=electron)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

## Overview

AgentDeck provides a unified workspace for running AI coding agents through WSL2 terminals:

- **Multi-Agent Support** — 7 agents: Claude Code, Aider, Codex, Goose, Gemini CLI, Amazon Q, OpenCode
- **Project Management** — Pin projects, configure startup commands, auto-detect stack
- **Split Terminal Views** — 1/2/3-pane layouts with drag-to-resize dividers
- **Prompt Templates** — 16 built-in templates across 8 categories with a full template editor
- **Visual Workflows** — Node-graph pipeline editor for chaining agents, shell commands, and checkpoints
- **Workflow Roles** — 8 reusable agent personas (Reviewer, Developer, Tester, Architect, etc.) with output format presets
- **8 Themes** — 4 dark (Amber, Cyan, Violet, Ice) + 4 light (Parchment, Fog, Lavender, Stone)

## Features

### Terminal Sessions

| Feature | Description |
|---------|-------------|
| Split view | 1, 2, or 3 terminal panes side-by-side (Ctrl+1/2/3) |
| GPU rendering | WebGL-accelerated terminal via @xterm/addon-webgl (canvas 2D fallback) |
| Session persistence | Terminal state (scrollback, cursor, colors) preserved across tab switches |
| Tab bar | Session + workflow tabs with polymorphic styling |
| Right panel | Context, Activity, and Memory tabs per session |
| Activity tracking | Real-time parsing of agent tool use from PTY stdout |
| File drag & drop | Drop files onto the terminal to paste WSL paths |
| Clipboard paste | Ctrl+V pastes text or file paths (CF_HDROP support) |

### Project Management

| Feature | Description |
|---------|-------------|
| New project wizard | 5-step setup: folder, auto-detect, startup commands, templates, confirm |
| Stack detection | Scans project files to detect language, package manager, and tools |
| Stack badges | Java, JS, TS, Python, Rust, Go, Ruby, PHP, C/C++, .NET, Docker, Agent |
| Startup commands | Ordered list of shell commands that run on session open |
| Environment variables | Per-project env vars, secrets encrypted via Electron safeStorage |
| Pinned projects | Quick-access sidebar with right-click context menu |

### Prompt Templates

| Feature | Description |
|---------|-------------|
| 8 categories | Orient, Review, Fix, Test, Refactor, Debug, Docs, Git |
| Template editor | Full editor with name, category, body, and live preview |
| Seeded library | 16 built-in templates created on first launch |
| Per-project binding | Assign templates to projects via settings or sidebar context menu |

### Agentic Workflows

| Feature | Description |
|---------|-------------|
| Node types | Agent, Shell, and Checkpoint nodes on a visual canvas |
| Visual editor | Drag-and-drop node graph with click-to-connect edges |
| Rich node cards | Labeled sections (Role badge, Agent, Task preview) with emoji type icons |
| Workflow roles | 8 built-in personas: Reviewer, Developer, Tester, Architect, Security Auditor, Docs Writer, Refactorer, Debugger |
| Node Editor panel | Tabbed right panel with detailed node editing + role selection |
| Execution engine | Topological sort into parallel tiers, `Promise.all` per tier |
| Workflow tabs | Open multiple workflows as first-class tabs alongside sessions |
| Log panel | Per-node execution logs with auto-scroll and scroll-lock |
| Auto-save | 500ms debounced save to JSON files |

### Theming & Polish

| Feature | Description |
|---------|-------------|
| 8 themes | Dark: Amber, Cyan, Violet, Ice — Light: Parchment, Fog, Lavender, Stone |
| Circular reveal | View Transition API animation on theme switch |
| Visual effects | 19 effects: spotlight cursor, card shimmer, glassmorphism, particles, aurora, neon glow, button press, tab close, scroll fades, node flash, edge particles, and more |
| Reduced motion | All effects respect `prefers-reduced-motion` |
| Zoom control | Ctrl+/- zoom (50%-250%), persisted across sessions |
| Command palette | Fuzzy search across projects, sessions, templates, and tools (Esc to toggle) |

## Installation

### Prerequisites

- Node.js 22 or later
- npm
- Windows 11 with WSL2 (Ubuntu recommended)

### Setup

```bash
cd agentdeck

# Install dependencies (--no-bin-links required on Windows-mounted drives)
npm install --no-bin-links
```

## Development

```bash
# Start Electron + Vite dev server with hot reload
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format

# Run tests (171 tests across 11 files)
npm test

# Production build
npm run build
```

## Building for Distribution

```bash
# Windows portable executable (~89 MB)
npm run dist
```

Output will be in the `dist/` folder.

## Quick Start

1. **Launch** — `npm run dev` or run the portable `.exe`
2. **Create a project** — Ctrl+N opens the new project wizard; point it at a WSL folder
3. **Open a session** — Click a pinned project or use the command palette (Esc)
4. **Split panes** — Ctrl+1/2/3 for single, dual, or triple terminal layout
5. **Run workflows** — Open a workflow from the sidebar to build agent pipelines
6. **Switch themes** — Open the command palette and navigate to the Themes sub-menu

## Project Structure

```
agentdeck/
├── src/
│   ├── main/                       # Electron main process
│   │   ├── index.ts                # App bootstrap, BrowserWindow, IPC handlers
│   │   ├── pty-manager.ts          # node-pty: spawn, resize, kill, write
│   │   ├── project-store.ts        # electron-store: projects, templates, prefs
│   │   ├── workflow-store.ts       # Workflow file CRUD (JSON)
│   │   ├── workflow-engine.ts      # Workflow execution engine
│   │   ├── detect-stack.ts         # File-based stack detection
│   │   ├── wsl-utils.ts            # WSL path conversion utilities
│   │   ├── pty-bus.ts              # PTY event bus (main-process IPC bridge)
│   │   └── logger.ts               # Structured logging
│   ├── preload/
│   │   └── index.ts                # contextBridge: safe IPC surface
│   ├── shared/
│   │   ├── types.ts                # Shared TypeScript interfaces
│   │   └── agents.ts               # Canonical agent registry (single source of truth)
│   └── renderer/                   # React app (Vite)
│       ├── App.tsx                  # Root layout, keybindings, IPC listeners
│       ├── store/
│       │   └── appStore.ts         # Zustand store (single store, sliced)
│       ├── components/
│       │   ├── Titlebar/           # Custom titlebar with tab bar
│       │   ├── Sidebar/            # Project list, workflow list, templates
│       │   ├── HomeScreen/         # Welcome screen, pinned cards, agent grid
│       │   ├── SplitView/          # 1/2/3-pane terminal layout
│       │   ├── Terminal/           # xterm.js terminal wrapper
│       │   ├── RightPanel/         # Context, Activity, Memory tabs
│       │   ├── CommandPalette/     # Fuzzy search overlay
│       │   ├── StatusBar/          # Session count, project, layout info
│       │   ├── NewProjectWizard/   # 5-step project creation
│       │   ├── ProjectSettings/    # 6-tab project configuration
│       │   ├── TemplateEditor/     # Template CRUD with live preview
│       │   ├── AboutDialog/        # Version and credits
│       │   ├── ErrorBoundary/      # React error boundary
│       │   └── shared/             # Reusable: Toggle, FieldRow, PathInput, etc.
│       ├── screens/
│       │   └── WorkflowEditor/     # Visual node-graph workflow editor
│       ├── hooks/
│       │   └── useProjects.ts      # Project CRUD hook
│       ├── utils/                  # templateUtils, workflowUtils
│       └── styles/
│           ├── tokens.css          # Design tokens (colors, fonts, spacing)
│           └── global.css          # Global styles and effects
├── package.json
├── electron-builder.yml
├── electron-vite.config.ts
├── tsconfig.*.json
└── eslint.config.mjs
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| [Electron 40](https://electronjs.org) | Desktop shell with ConPTY support |
| [React 19](https://react.dev) | Component-based UI |
| [TypeScript 5](https://typescriptlang.org) | Strict type-safe development |
| [electron-vite 5](https://electron-vite.org) | Build tooling + hot reload |
| [xterm.js 5](https://xtermjs.org) | Terminal emulator (same as VS Code) |
| [node-pty](https://github.com/nickvdp/node-pty) | Pseudo-terminal for WSL sessions |
| [Zustand 5](https://zustand-demo.pmnd.rs) | Lightweight state management |
| [React Flow](https://reactflow.dev) | Node-graph canvas for workflows |
| [electron-store 11](https://github.com/nickvdp/electron-store) | Persistent JSON storage |
| [dnd-kit](https://dndkit.com) | Drag-and-drop (sortable lists) |

## Design References

The project includes HTML mockups (open in any browser) that serve as pixel-perfect design specifications:

| Mockup | Description |
|--------|-------------|
| `agentdeck-home.html` | Home / launch screen |
| `agentic-sandbox-ui.html` | Main session view (tabs + terminal + panels) |
| `agentdeck-split-view.html` | Split terminal layout (1/2/3 panes) |
| `agentdeck-command-palette.html` | Command palette overlay |
| `agentdeck-new-project.html` | 5-step new project wizard |
| `agentdeck-project-settings.html` | 6-tab project settings |
| `agentdeck-template-editor.html` | Template editor with preview |
| `agentdeck-workflows-mockup.html` | Workflow editor canvas |
| `agentdeck-workflow-tabs-mockup.html` | Polymorphic tab bar |
| `agentdeck-roles-mockup.html` | Workflow roles concept (Approach A/B) |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Esc | Toggle command palette |
| Ctrl+N | New project wizard |
| Ctrl+B | Toggle sidebar |
| Ctrl+\\ | Toggle right panel |
| Ctrl+1/2/3 | Set pane layout (single/dual/triple) |
| Ctrl++/- | Zoom in/out |
| Ctrl+0 | Reset zoom |

## Security

- Context isolation enabled (`contextIsolation: true`, `nodeIntegration: false`)
- Content Security Policy via `<meta>` tag (restricts scripts, styles, and connections)
- All Node.js access goes through the preload `contextBridge`
- Environment variable secrets encrypted at rest via Electron `safeStorage`
- No telemetry, no network requests (fonts bundled locally)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run lint`, `npm run typecheck`, and `npm test`
5. Submit a pull request

## License

MIT License - see [LICENSE](./LICENSE) for details.
