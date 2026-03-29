# AgentDeck

A desktop terminal manager for WSL AI coding agents. Launch, manage, and orchestrate sessions across multiple agents from a single interface.

![Electron](https://img.shields.io/badge/Electron-40-47848F?logo=electron)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![License: Elastic-2.0](https://img.shields.io/badge/License-Elastic--2.0-blue.svg)
![Tests](https://img.shields.io/badge/Tests-499_passing-brightgreen)

## Why AgentDeck?

If you work with AI coding agents, you know the pain: each agent is its own CLI, its own terminal tab, its own workflow. Switching between Claude Code, Codex, Aider, and others means juggling windows, re-typing project paths, and losing context.

AgentDeck puts all your agents in one place. Open a project, pick an agent, and you're coding. Split the screen to run two agents side-by-side. Chain agents into automated workflows with conditions, loops, and variables. Keep your prompt templates, project configs, and session history organized instead of scattered across terminals.

It's a desktop app, not a web service — your code stays local, your API keys are encrypted at rest, and everything runs through your own WSL environment.

<!-- TODO: Add screenshots/GIFs showcasing the UI -->
<!-- ![AgentDeck Screenshot](docs/assets/screenshot.png) -->

## Overview

AgentDeck provides a unified desktop environment for working with AI coding agents through WSL terminals:

- **Multi-Agent Support** - 7 agents: Claude Code, Codex, Aider, Goose, Gemini CLI, Amazon Q, OpenCode
- **Project Management** - Configure projects with paths, agents, prompt templates, and stack badges
- **Split Terminal Views** - 1/2/3 pane layouts with independent sessions
- **Agentic Workflows** - Visual node-graph editor with conditions, loops, variables, and execution history
- **8 Themes** - 4 dark + 4 light themes with smooth view transitions
- **Command Palette** - Quick access to projects, sessions, templates, and tools

## Features

### Terminal Sessions

- **Split View** - Up to 3 terminal panes side-by-side with draggable dividers
- **Bare Terminals** - Open plain WSL shells without a project (Ctrl+T)
- **Terminal Caching** - Sessions persist across tab switches without re-rendering
- **Terminal Search** - Find text in terminal output (Ctrl+Shift+F) with regex and case-sensitive modes
- **Activity Tracking** - Real-time parsing of agent tool use (file reads, writes, commands)
- **Right Panel** - Context, Activity, and Memory tabs per session

### Project Management

- **New Project Wizard** - 5-step setup with folder picker and agent configuration
- **Multi-Agent Projects** - Assign multiple agents per project, launch with any via context menu
- **Stack Detection** - Auto-detect project stack (React, Python, Rust, etc.) from files
- **Pinned Projects** - Pin favorites to the home screen grid
- **Project Settings** - 6-tab settings panel for path, agent, templates, and more

### Prompt Templates

- **16 Seed Templates** - Ready-to-use templates across 8 categories
- **Template Editor** - Create and edit templates with live preview
- **Template Attach** - Attach templates to sessions from the Context tab
- **Categories** - Code Review, Debugging, Documentation, Planning, Refactoring, Security, Testing, General

### Agentic Workflows

- **Visual Node Graph** - Drag-and-drop editor for agent, shell, checkpoint, and condition nodes
- **Edge-Activation Scheduler** - Ready-queue execution with branching, skip propagation, and loop support
- **Conditional Branching** - Route execution based on exit codes or output pattern matching
- **Loop/Retry** - Loop-back edges with max iterations, per-node retry with configurable delay
- **Variables** - `{{VAR}}` substitution with typed pre-run dialog (string, text, path, choice)
- **Roles** - 8 seed roles (Architect, Reviewer, etc.) with persona injection
- **Checkpoints** - Pause/resume execution at designated points
- **Import/Export** - Share workflows as `.agentdeck-workflow.json` bundles with role remapping
- **Execution History** - Per-run summaries with node timing, error tails, and a History tab

### Command Palette

- **Quick Launch** - Open projects, switch sessions, run templates (Ctrl+K / Escape)
- **Theme Switcher** - Live-preview themes before applying
- **Agent Visibility** - Toggle which agents appear on the home screen
- **Keyboard Shortcuts** - Full shortcut reference (Ctrl+/)

### Agent Updates

- **Version Checking** - Startup notification when agent updates are available
- **One-Click Update** - Update agents directly from the home screen (resolves exact version from registry)
- **Automatic Detection** - Discovers installed agents via WSL PATH

### Theming

| Dark | Light |
|------|-------|
| Amber (default) | Parchment |
| Navy + Cyan | Fog |
| Midnight + Violet | Lavender |
| Charcoal + Ice | Stone |

All themes use CSS custom properties. View transitions provide smooth theme switching with a circular reveal effect.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+K | Command Palette |
| Escape | Command Palette (from session) |
| Ctrl+N | New Project |
| Ctrl+T | New Terminal |
| Ctrl+B | Toggle Sidebar |
| Ctrl+\\ | Toggle Right Panel |
| Ctrl+/ | Keyboard Shortcuts |
| Ctrl+1/2/3 | Pane Layout |
| Ctrl++/- | Zoom In/Out |
| Ctrl+0 | Reset Zoom |
| Ctrl+Shift+F | Search in Terminal |
| Ctrl+S | Save Template |

## Installation

### Prerequisites
- Windows 10/11 with WSL2 (Ubuntu recommended)
- Node.js 22 or later
- At least one AI coding agent installed in WSL

### Setup

```bash
# Install dependencies (--no-bin-links required on Windows-mounted drives)
npm install --no-bin-links
```

## Development

```bash
# Start development server with hot reload
npm run dev

# Build for production (validates TypeScript)
npm run build

# Run tests (499 tests)
npm test

# Lint code (zero-warning policy)
npm run lint

# Format code
npm run format
```

## Building for Distribution

```bash
# Build portable Windows executable
npm run dist
```

Output: `dist/AgentDeck-{version}-portable.exe` (~89 MB)

## Project Structure

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App lifecycle, IPC handler registration
│   ├── ipc/                 # 6 IPC modules (pty, window, agents, projects, workflows, utils)
│   ├── pty-manager.ts       # node-pty: spawn, resize, kill, activity parsing
│   ├── workflow-engine.ts   # Edge-activation scheduler DAG execution
│   ├── edge-scheduler.ts    # Pure scheduler: ready queue, branching, skip, loop reset
│   ├── variable-substitution.ts # {{VAR}} replacement in workflow nodes
│   ├── workflow-run-store.ts # Execution history persistence
│   ├── agent-updater.ts     # Agent version checking and updating via WSL
│   └── project-store.ts     # electron-store: CRUD + safeStorage for API keys
├── preload/
│   └── index.ts             # contextBridge: safe IPC surface (window.agentDeck)
├── renderer/                # React app (Vite)
│   ├── components/          # Titlebar, Sidebar, SplitView, CommandPalette,
│   │                        # HomeScreen, StatusBar, Terminal, RightPanel, etc.
│   ├── screens/             # WorkflowEditor, ProjectSettings, TemplateEditor
│   ├── store/               # Zustand store (6 slices: sessions, ui, projects, workflows, templates, notifications)
│   ├── hooks/               # useProjects, usePty, useRolesMap
│   └── styles/              # tokens.css (design system), global.css
└── shared/
    ├── agents.ts            # Agent registry (7 agents with metadata)
    ├── types.ts             # Shared TypeScript interfaces
    └── workflow-utils.ts    # Workflow validation + topological sort
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| [Electron 40](https://electronjs.org) | Desktop application shell |
| [React 19](https://react.dev) | UI framework |
| [TypeScript 5](https://typescriptlang.org) | Type-safe development (strict mode) |
| [electron-vite 5](https://electron-vite.org) | Build tooling |
| [xterm.js 5](https://xtermjs.org) | Terminal emulator |
| [node-pty](https://github.com/microsoft/node-pty) | Pseudo-terminal (WSL sessions) |
| [Zustand](https://zustand-demo.pmnd.rs) | State management |
| [React Flow](https://reactflow.dev) | Visual workflow node editor |
| [Vitest 4](https://vitest.dev) | Testing framework (499 tests) |
| [ESLint 9](https://eslint.org) | Linting (flat config, zero-warning policy) |

## Documentation

- **[User Guide](./docs/USER-GUIDE.md)** - Detailed usage instructions
- **[Changelog](./CHANGELOG.md)** - Version history and release notes
- **[Contributing](./CONTRIBUTING.md)** - How to contribute
- **[Security](./SECURITY.md)** - Reporting vulnerabilities

## License

[Elastic License 2.0](./LICENSE) — free to use, modify, and share. You may not offer it as a hosted/managed service.

## Support

- Star this repository
- [Report issues](../../issues) or suggest features
