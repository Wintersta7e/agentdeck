# AgentDeck User Guide

> **Version**: 3.10.0

AgentDeck is a desktop command center for managing AI coding agents through WSL2 terminals. This guide covers every feature from first launch to advanced workflow automation.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Home Screen](#home-screen)
3. [Creating a Project](#creating-a-project)
4. [Terminal Sessions](#terminal-sessions)
5. [Bare Terminals](#bare-terminals)
6. [Split View](#split-view)
7. [Terminal Search](#terminal-search)
8. [Right Panel](#right-panel)
9. [Sidebar](#sidebar)
10. [Prompt Templates](#prompt-templates)
11. [Agentic Workflows](#agentic-workflows)
12. [Workflow Roles](#workflow-roles)
13. [Command Palette](#command-palette)
14. [Agent Updates](#agent-updates)
15. [Themes](#themes)
16. [Keyboard Shortcuts](#keyboard-shortcuts)
17. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

- Windows 11 with WSL2 installed (Ubuntu recommended)
- At least one AI coding agent installed in WSL (e.g., Claude Code, Aider, Codex)

### Launching

Run the portable executable (`AgentDeck-{version}-portable.exe`) or start from source:

```bash
cd agentdeck
npm install --no-bin-links
npm run dev
```

On first launch, AgentDeck will:
1. Render the home screen immediately
2. Detect your WSL username and installed agents in the background
3. Check for agent updates and show a toast notification if any are available
4. Seed 16 prompt templates and 8 workflow roles into local storage

If WSL is still booting (cold start can take 15+ seconds), the app retries automatically after 5 seconds.

---

## Home Screen

The home screen appears when no session or workflow tab is active.

- **Greeting** — Shows your WSL username and the current date
- **Pinned Projects** — Cards for your saved projects, click to open a session
- **Agent Grid** — Shows all available agents with detection status, version info, and update buttons
- **Quick Actions** — New Project (Ctrl+N), New Terminal (Ctrl+T), open Command Palette (Esc)

### Agent Detection

AgentDeck checks for 7 agents by running `which <binary>` in your WSL environment:

| Display Name | Binary | Notes |
|-------------|--------|-------|
| Claude Code | `claude` | Anthropic's coding agent |
| Aider | `aider` | AI pair programming |
| Codex | `codex` | OpenAI's coding agent |
| Goose | `goose` | Block's AI agent |
| Gemini CLI | `gemini` | Google's coding agent |
| Amazon Q | `q` | AWS coding agent |
| OpenCode | `opencode` | Open-source agent |

Agents that aren't installed appear greyed out. You can hide/show agents via the Command Palette > Agents sub-menu.

---

## Creating a Project

Press **Ctrl+N** or click "New Project" to open the 5-step wizard:

### Step 1: Project Folder

Select a folder path. AgentDeck accepts multiple formats and auto-converts to WSL paths:
- WSL native: `/home/user/project`
- Windows: `C:\Users\...` (converted to `/mnt/c/Users/...`)
- UNC: `\\wsl$\Ubuntu\home\...` or `\\wsl.localhost\Ubuntu\...` (prefix stripped)
- Tilde: `~/project` (expanded to `$HOME/project`)

### Step 2: Stack Detection

AgentDeck scans your project files and auto-detects:
- Language (Python, TypeScript, Rust, Go, Java, etc.)
- Package manager (npm, pip, cargo, etc.)
- Tools (Docker, Git, etc.)

Detected items appear as **stack badges** on your project card.

### Step 3: Templates

Select which prompt templates to attach to this project. Attached templates appear in the Context tab and can be sent to the terminal with one click.

### Step 4: Startup Commands

Add shell commands that run automatically when you open a session for this project. Common examples:
- `cd /path/to/project`
- `source venv/bin/activate`
- `nvm use 22`

### Step 5: Confirm

Review your settings and create the project. It appears in the sidebar under "Projects."

---

## Terminal Sessions

Click a pinned project on the home screen or sidebar to open a session. Each session:

- Opens a real WSL terminal (pseudo-terminal via node-pty)
- Renders with GPU-accelerated WebGL (falls back to canvas 2D if unavailable)
- Runs your startup commands in order
- Launches in your configured agent (or your default shell)
- Preserves full terminal state (scrollback, cursor position, colors) when switching tabs

### Opening a Session

Multiple ways to start:
1. Click a project card on the home screen
2. Click a pinned project in the sidebar
3. Use the Command Palette (Esc > search project name)

### Session Tabs

Each session appears as a tab in the title bar with a green dot indicator. Click tabs to switch between sessions. The active tab has an amber underline.

- **Close** — Click the X on a tab (session PTY is killed)
- **Reorder** — Tabs appear in creation order (sessions left, workflows right)

### Terminal Input

- **Type** — Standard terminal input, all keyboard shortcuts pass through
- **Paste text** — Ctrl+V pastes clipboard text
- **Paste files** — Ctrl+V with files on clipboard pastes their WSL paths
- **Drag & drop** — Drag files from Windows Explorer onto the terminal to paste their WSL path

### Agent Flags

Each project can have agent-specific CLI flags (e.g., `--model opus` for Claude Code). Set these in Project Settings > Agent Flags.

---

## Bare Terminals

Press **Ctrl+T** or select "New Terminal" from the Command Palette to open a plain WSL bash shell. No project or agent is attached — just a raw terminal. Useful for:
- Running system commands
- Installing tools
- Quick file operations
- Testing commands before configuring a project

Bare terminals show "Terminal" in the tab bar and "shell" as the agent label in the pane topbar.

---

## Split View

AgentDeck supports 1, 2, or 3 terminal panes side-by-side:

| Shortcut | Layout |
|----------|--------|
| Ctrl+1 | Single pane |
| Ctrl+2 | Two panes (horizontal split) |
| Ctrl+3 | Three panes (horizontal split) |

- **Resize** — Drag the divider between panes
- **Independent sessions** — Each pane runs its own PTY session
- **Preserved state** — Terminal instances are cached across tab switches, preserving scrollback history, cursor position, alternate buffer state, and colors. Hidden panes buffer incoming data and flush it when shown again.

---

## Terminal Search

Press **Ctrl+Shift+F** in a terminal session to open the search bar.

| Action | Shortcut |
|--------|----------|
| Next match | Enter |
| Previous match | Shift+Enter |
| Toggle regex | Alt+R |
| Toggle case-sensitive | Alt+C |
| Toggle whole word | Alt+W |
| Close search | Escape |

Match count and current position are displayed in the search bar.

---

## Right Panel

The right panel appears alongside terminal sessions and contains three tabs:

### Context Tab

Shows project configuration:
- **Attached templates** — Click a template to send its content to the active terminal
- **Project notes** and metadata
- **Files in context** — CLAUDE.md, AGENTS.md if present in the project

### Activity Tab

Real-time parsing of agent output:
- File reads/writes
- Tool use events
- Command execution
- Structured output from Claude Code and other agents

### Memory Tab

Displays the raw content of project configuration files (CLAUDE.md, AGENTS.md) from the project folder.

### Resize

Drag the left edge of the right panel to resize it. Toggle visibility with **Ctrl+\\**.

---

## Sidebar

The sidebar (toggle with **Ctrl+B**) has collapsible sections:

### Projects Section

- Shows all pinned projects
- **Right-click** a project to:
  - **Attach Templates** — Opens an inline panel with category-grouped checkboxes to assign templates
  - **Remove Project** — Unpins the project from the sidebar

### Workflows Section

- Lists all saved workflows
- Click to open a workflow in a new tab
- **Right-click** to delete a workflow (with confirmation)

### Resize

Drag the right edge of the sidebar to resize it. Width is persisted across sessions.

---

## Prompt Templates

AgentDeck ships with 16 built-in templates across 8 categories:

| Category | Templates |
|----------|-----------|
| Orient | Codebase Orientation, Architecture Map |
| Review | Code Review, Security Audit |
| Fix | Bug Fix, Error Resolution |
| Test | Test Suite, Coverage Analysis |
| Refactor | Clean Refactor, DRY Extraction |
| Debug | Debug Investigation, Log Analysis |
| Docs | Documentation, API Reference |
| Git | Commit Message, PR Description |

### Using Templates

1. **Sidebar** — Click a template to open it in the Template Editor
2. **Context Tab** — Click an attached template to send its content to the terminal
3. **Command Palette** — Search for a template by name
4. **Input Bar** — Template chips appear below the terminal for quick access

### Template Editor

Open any template to edit:
- **Name** — Display name
- **Category** — Dropdown to assign a category
- **Body** — Full template text with live preview

### Creating Custom Templates

In the Template Editor, click "New Template" to create your own. Custom templates are preserved across updates; built-in templates (prefixed with `seed-`) may be refreshed when AgentDeck updates.

### Attaching Templates to Projects

Two ways:
1. **Project Settings** > Templates tab
2. **Sidebar** > Right-click project > Attach Templates

---

## Agentic Workflows

Workflows let you chain multiple agents, shell commands, and manual checkpoints into automated pipelines.

### Creating a Workflow

1. Click "New Workflow" in the sidebar (or use the Command Palette)
2. A blank canvas opens with a toolbar at the top

### Node Types

| Type | Icon | Description |
|------|------|-------------|
| Agent | :robot: | Runs an AI agent in non-interactive (print) mode |
| Shell | :computer: | Executes a shell command in WSL |
| Checkpoint | :white_check_mark: | Pauses execution until you click Resume |

### Adding Nodes

Click the node type buttons in the toolbar to add nodes to the canvas. Each node appears as a card with:
- **Header** — Type icon, node name, type badge (Agent/Shell/Check)
- **Body** — Labeled sections showing Role (if assigned), Agent name, and Task/Command preview

### Connecting Nodes

1. Click the output port (right side) of a source node
2. Click the input port (left side) of a target node
3. An edge (arrow) connects them

Press **Escape** to cancel a pending connection.

### Editing Nodes

Two ways to edit:
1. **Click a node** — Opens the Node Editor in the right panel tab
2. **Double-click a node** — Opens the inline edit form on the node card itself

### Node Editor Panel

The right panel has two tabs:
- **Node Editor** (default) — Full editing interface for the selected node
- **Execution Log** — Shows per-node output during workflow runs

The Node Editor shows different fields based on node type:

**Agent nodes:**
| Field | Description |
|-------|-------------|
| Name | Display name on the canvas |
| Agent | Dropdown to select which agent runs this node |
| Role | Dropdown to assign a persona (see Workflow Roles) |
| Persona preview | Read-only display of the role's system prompt |
| Task Prompt | Your specific instructions for this step |
| Output Format preview | Read-only display of the role's expected output structure |
| Agent Flags | Optional CLI flags |

**Shell nodes:**
| Field | Description |
|-------|-------------|
| Name | Display name |
| Command | Shell command to execute |
| Timeout | Maximum execution time in milliseconds (default: 60000) |

**Checkpoint nodes:**
| Field | Description |
|-------|-------------|
| Name | Display name |
| Message | Text shown while waiting for user to resume |

### Running a Workflow

1. Click "Run Workflow" in the toolbar
2. The right panel auto-switches to the **Execution Log** tab
3. Nodes execute in topological order — nodes with no dependencies run in parallel
4. Each node shows status: idle, running (green pulse), done (green), error (red)
5. Checkpoint nodes pause and show a "Resume" button

### How Execution Works

1. **Topological sort** — Nodes are sorted into tiers based on edge connections
2. **Parallel tiers** — All nodes in a tier run simultaneously via `Promise.all`
3. **Context passing** — Output from upstream nodes is passed as context to downstream nodes
4. **Agent prompt assembly** — For agent nodes with a role: `[persona] + [task prompt] + [output format] + [upstream context]`

### Stopping a Workflow

Click "Stop" in the toolbar. All running agent processes and pending checkpoints are immediately terminated.

### Managing Workflows

- **Auto-save** — Changes save automatically after 500ms of inactivity
- **Delete** — Right-click a workflow in the sidebar > Delete
- **Multiple open** — Workflows open as purple tabs alongside session tabs

---

## Workflow Roles

Roles are reusable agent personas that define how an agent should behave and format its output.

### Built-in Roles

AgentDeck includes 8 seed roles:

| Role | Icon | Purpose |
|------|------|---------|
| Reviewer | :clipboard: | Code review: bugs, security, performance, best practices |
| Developer | :wrench: | Feature implementation: clean, tested, production-ready code |
| Tester | :test_tube: | QA: comprehensive tests for happy paths, edge cases, error paths |
| Architect | :building_construction: | Design evaluation: trade-offs, scalability, maintainability |
| Security Auditor | :lock: | Security audit: OWASP Top 10, injection, auth, data exposure |
| Documentation Writer | :open_book: | Technical writing: clear docs matching project conventions |
| Refactorer | :recycle: | Code improvement: readability, DRY, SOLID without behavior changes |
| Debugger | :bug: | Root cause analysis: systematic reproduce, isolate, fix, verify |

### What a Role Contains

- **Persona** — System prompt describing the agent's expertise and approach
- **Output Format** — Expected structure for the agent's response (e.g., `## Review Report` with Findings + Summary sections)

### Assigning a Role

1. Select an agent node on the workflow canvas
2. In the Node Editor panel, use the **Role** dropdown
3. Select a role — the persona and output format previews appear below
4. Write your task-specific prompt in the **Task Prompt** field

The role's persona and output format are automatically prepended to your task prompt when the workflow runs.

### Example Workflow with Roles

A typical code review pipeline:

```
[Developer]        [Reviewer]        [Tester]
 claude-code  -->  claude-code  -->  claude-code
 "Implement        "Review the       "Write tests
  the login         implementation    for the login
  feature"          for security"     feature"
```

Each node uses a different role but can use the same or different agents.

---

## Command Palette

Press **Esc** (or **Ctrl+K**) to toggle the command palette. It provides fuzzy search across:

| Tab | Contents |
|-----|----------|
| Tools | Theme switcher, zoom, agents visibility, new project/workflow |
| Projects | All saved projects |
| Templates | All templates (opens editor) |
| Sessions | Active terminal sessions |

### Navigation

- **Arrow keys** — Move selection up/down
- **Enter** — Execute selected item
- **Esc** — Close palette (or press Esc again to toggle)
- **Type** — Fuzzy search filters results in real-time

### Theme Preview

In the Themes sub-menu, arrow keys give a live preview of each theme. Press Enter to apply, or Esc to revert to your current theme.

---

## Agent Updates

AgentDeck checks for agent updates on startup and shows a toast notification when updates are available.

### How It Works

1. On launch, AgentDeck detects installed agents via `which` in WSL
2. For each installed agent, it checks the current version vs. the latest available
3. A toast notification summarizes available updates
4. Click "Update" on any agent card on the home screen to update in place

### Manual Refresh

Use the Command Palette or home screen to re-check agent status. This also triggers update detection. If the initial check failed (e.g., WSL was still booting), the app retries automatically after 5 seconds.

---

## Themes

AgentDeck includes 8 themes:

### Dark Themes

| Theme | Accent | Description |
|-------|--------|-------------|
| Amber | Orange-gold | Warm, focused (default) |
| Cyan | Teal-blue | Cool, technical |
| Violet | Purple | Creative, modern |
| Ice | Light blue | Clean, minimal |

### Light Themes

| Theme | Description |
|-------|-------------|
| Parchment | Warm paper-like background |
| Fog | Cool grey with blue accents |
| Lavender | Soft purple tones |
| Stone | Neutral warm grey |

### Switching Themes

1. Open Command Palette (Esc)
2. Navigate to Themes
3. Arrow keys preview themes in real-time
4. Enter to apply

Theme changes use a circular reveal animation (View Transition API). Light themes keep terminal backgrounds dark for readability.

---

## Keyboard Shortcuts

Press **Ctrl+/** to view the full shortcut reference overlay at any time.

### Global

| Shortcut | Action |
|----------|--------|
| **Ctrl+K** | Command Palette |
| **Esc** | Command Palette (from session) |
| **Ctrl+N** | New Project |
| **Ctrl+T** | New Terminal |
| **Ctrl+B** | Toggle Sidebar |
| **Ctrl+\\** | Toggle Right Panel |
| **Ctrl+/** | Keyboard Shortcuts |
| **Ctrl+1/2/3** | Pane Layout |
| **Ctrl++/-** | Zoom In/Out |
| **Ctrl+0** | Reset Zoom |

### Terminal

| Shortcut | Action |
|----------|--------|
| **Ctrl+Shift+F** | Search in Terminal |
| **Ctrl+Shift+C** | Copy Selection |
| **Ctrl+V** | Paste |

### Search Bar

| Shortcut | Action |
|----------|--------|
| **Enter** | Next Match |
| **Shift+Enter** | Previous Match |
| **Alt+R** | Toggle Regex |
| **Alt+C** | Toggle Case Sensitive |
| **Alt+W** | Toggle Whole Word |
| **Esc** | Close Search |

### Command Palette

| Shortcut | Action |
|----------|--------|
| **Up/Down** | Navigate Items |
| **Enter** | Execute Selected |
| **Space** | Toggle (in agent list) |
| **Esc** | Close / Back |

### Editors

| Shortcut | Action |
|----------|--------|
| **Ctrl+S** | Save Template |
| **Delete** | Delete Template |
| **Enter** | Commit Node / Rename Edit |
| **Shift+Enter** | Newline in Node Edit |
| **Esc** | Cancel Edit / Close Dialog |

### Workflow Editor

| Shortcut | Action |
|----------|--------|
| **Esc** | Cancel pending edge connection |
| **Double-click node** | Open inline edit form |
| **Click node** | Select and edit in Node Editor panel |

---

## Troubleshooting

### Agent not detected

AgentDeck runs `which <binary>` in an interactive bash shell. If an agent isn't detected:
1. Verify it's installed: `which claude` (or the agent's binary name) in your WSL terminal
2. Ensure it's on your PATH in `.bashrc` or `.profile`
3. Restart AgentDeck after installing new agents

### Terminal shows blank or garbled output

- Try **Ctrl+0** to reset zoom
- OSC color query responses from some agents (Codex, crossterm-based tools) are automatically filtered
- If you see garbled output, ensure your WSL locale is UTF-8: `locale` should show `en_US.UTF-8`
- Check that your WSL distribution is running (`wsl --list --verbose`)

### WSL username shows "operator"

The username lookup uses a fallback chain (`bash -lc whoami` -> `whoami` -> `echo $USER`). If it fails on first launch (WSL cold boot), the app retries after 5 seconds. Restart AgentDeck if it persists.

### Project path errors

AgentDeck accepts paths in multiple formats:
- WSL native: `/home/user/project`
- Windows: `C:\Users\...` (auto-converted to `/mnt/c/Users/...`)
- UNC: `\\wsl$\Ubuntu\home\...` (prefix stripped automatically)
- Tilde: `~/project` (expanded to `$HOME/project`)

If `cd` fails, check that the path exists inside WSL: `ls /path/to/project`

### Agent update button not appearing

- Agent updates are checked on startup. If WSL was still booting, the check may have timed out.
- Trigger a manual refresh from the home screen or Command Palette.
- The app retries automatically 5 seconds after a failed initial check.

### Workflow agent node fails

- Verify the agent is installed and detected (check the home screen agent grid)
- Check the Execution Log tab for error messages
- Ensure your project path is a valid WSL path
- Shell nodes have a 60-second default timeout — increase it in the Node Editor if needed

### Terminal scrolling doesn't work

If the scrollbar is missing or content is cut off:
1. Switch to another tab and switch back — this triggers a viewport resync
2. Try resizing the window or split pane divider
3. If the issue persists, close and reopen the session

### Fonts look wrong

AgentDeck bundles JetBrains Mono and Syne locally. If fonts appear incorrect:
1. The portable exe may need to extract fully on first run
2. Try restarting the application

### Build issues on WSL-mounted drives

When running from `/mnt/c/` or similar Windows-mounted paths:
```bash
npm install --no-bin-links
```

This avoids symlink issues that Windows filesystems don't support.
