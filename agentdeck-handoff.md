# AgentDeck — Claude Code Handoff

> Electron desktop app. Launches WSL agent sessions (claude-code, aider, etc.) with a project management UI, prompt templates, and split terminal view.

---

## Stack

| Layer | Technology | Reason |
|---|---|---|
| Shell | Electron 29+ | ConPTY/WinPTY support on Windows; node-pty is battle-tested (VS Code uses it) |
| Renderer | React 18 + Vite | Component model for the multi-pane UI |
| Terminal | xterm.js 5 | Actual VS Code terminal renderer; handles ANSI, colour, etc. |
| PTY | node-pty | Spawns WSL pseudo-terminals; must run in main process |
| Styling | CSS Modules or plain CSS | No Tailwind needed — design system is hand-rolled |
| Fonts | JetBrains Mono + Syne | Load from Google Fonts or bundle locally |
| Storage | electron-store (JSON) | Project configs, template data, app prefs |
| IPC | Electron contextBridge | Renderer ↔ Main; never expose raw ipc in renderer |

---

## Project Structure

```
agentdeck/
├── src/
│   ├── main/                      # Electron main process (Node.js)
│   │   ├── index.js               # App bootstrap, BrowserWindow setup
│   │   ├── pty-manager.js         # node-pty: spawn, resize, kill, write
│   │   ├── project-store.js       # electron-store: CRUD for projects + templates
│   │   └── preload.js             # contextBridge: exposes safe IPC surface
│   │
│   └── renderer/                  # React app
│       ├── index.html
│       ├── main.jsx               # React root
│       ├── styles/
│       │   ├── tokens.css         # CSS custom properties (design tokens)
│       │   └── global.css         # Reset + base typography
│       │
│       ├── components/
│       │   ├── Titlebar/          # Logo, tab bar, Split button, ⌘K
│       │   ├── Sidebar/           # Pinned projects, recent, templates, agent status
│       │   ├── TabBar/            # Session tabs with status dots
│       │   ├── Terminal/          # xterm.js wrapper component
│       │   ├── SplitView/         # Resizable pane layout (1/2/3 columns)
│       │   ├── Pane/              # Individual terminal pane + input bar
│       │   ├── InputBar/          # Prompt input + template chips
│       │   ├── CommandPalette/    # ⌘K overlay, fuzzy search
│       │   ├── Home/              # Launch screen (no active session)
│       │   └── StatusBar/         # Bottom bar
│       │
│       ├── screens/
│       │   ├── NewProjectWizard/  # 5-step wizard
│       │   ├── ProjectSettings/   # Tabbed settings panel
│       │   └── TemplateEditor/    # Left list + write + preview
│       │
│       ├── store/
│       │   └── appStore.js        # React state (Zustand or useContext)
│       │
│       └── hooks/
│           ├── usePty.js          # IPC bridge for PTY events
│           └── useProjects.js     # Project CRUD via IPC
│
├── package.json
├── vite.config.js
└── electron-builder.yml
```

---

## Design Tokens (CSS Custom Properties)

Paste into `tokens.css`. All components reference these — never hardcode colours.

```css
:root {
  /* Backgrounds — layered from darkest to lightest */
  --bg0: #0d0e0f;   /* app background */
  --bg1: #111213;   /* sidebar, panel backgrounds */
  --bg2: #161718;   /* cards, section backgrounds */
  --bg3: #1c1d1f;   /* input fields, hover states */
  --bg4: #222325;   /* badges, chips, faint fills */

  /* Borders */
  --border: #2a2b2d;
  --border-bright: #363739;

  /* Text hierarchy */
  --text0: #f0ede8;  /* primary — headings, active labels */
  --text1: #b8b4ae;  /* secondary — body, list items */
  --text2: #6e6b66;  /* muted — descriptions, hints */
  --text3: #3d3b38;  /* faint — placeholders, line numbers */

  /* Accent colours */
  --amber:       #f5a623;                   /* primary action, focus, active state */
  --amber-glow:  rgba(245, 166, 35, 0.12);  /* amber tinted backgrounds */
  --amber-glow2: rgba(245, 166, 35, 0.06);  /* very faint amber fill */

  --green:     #4caf7d;                    /* running / success */
  --green-dim: rgba(76, 175, 125, 0.12);

  --red:     #e05c5c;                   /* error / danger */
  --red-dim: rgba(224, 92, 92, 0.12);

  --blue:   #5b9bd5;   /* Maven, TypeScript, info */
  --purple: #9b72cf;   /* agent messages */

  /* Shape */
  --r: 4px;  /* standard border-radius */

  /* Typography */
  --font-mono: 'JetBrains Mono', monospace;
  --font-display: 'Syne', sans-serif;
}
```

---

## IPC Surface (preload.js → renderer)

Keep this minimal. The renderer never imports Node modules directly.

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentDeck', {
  // PTY
  pty: {
    spawn:  (projectId, cols, rows) => ipcRenderer.invoke('pty:spawn',  projectId, cols, rows),
    write:  (projectId, data)       => ipcRenderer.invoke('pty:write',  projectId, data),
    resize: (projectId, cols, rows) => ipcRenderer.invoke('pty:resize', projectId, cols, rows),
    kill:   (projectId)             => ipcRenderer.invoke('pty:kill',   projectId),
    onData: (projectId, cb)         => {
      const channel = `pty:data:${projectId}`;
      ipcRenderer.on(channel, (_, data) => cb(data));
      return () => ipcRenderer.removeAllListeners(channel);
    },
  },
  // Projects
  projects: {
    list:   ()        => ipcRenderer.invoke('projects:list'),
    get:    (id)      => ipcRenderer.invoke('projects:get',    id),
    create: (data)    => ipcRenderer.invoke('projects:create', data),
    update: (id, data)=> ipcRenderer.invoke('projects:update', id, data),
    delete: (id)      => ipcRenderer.invoke('projects:delete', id),
  },
  // Templates
  templates: {
    list:   ()        => ipcRenderer.invoke('templates:list'),
    save:   (tpl)     => ipcRenderer.invoke('templates:save',   tpl),
    delete: (id)      => ipcRenderer.invoke('templates:delete', id),
  },
  // File picker (for project path)
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
});
```

---

## Project Data Shape

```javascript
// Stored in electron-store as projects[id]
{
  id: 'uuid-v4',
  name: 'xjustiz-tools',
  path: '/home/rooty/projects/xjustiz-tools',  // WSL path
  wslDistro: 'Ubuntu-24.04',                    // optional, uses default if empty
  badge: 'Java',                                // Java | JS | TS | Python | Rust | Agent | Other
  icon: '☕',
  accentColor: '#e55934',
  pinned: true,
  autoOpen: false,
  startupCommands: [
    'cd /home/rooty/projects/xjustiz-tools',
    'claude'
  ],
  env: {
    JAVA_HOME: '/usr/lib/jvm/java-21-openjdk-amd64',
    ANTHROPIC_API_KEY: '...'   // stored encrypted via safeStorage
  },
  agentCommand: 'claude',
  agentFlags: '',
  contextFile: 'AGENTS.md',
  attachedTemplates: ['tpl-uuid-1', 'tpl-uuid-2'],
  lastOpened: '2026-02-26T09:00:00Z',
  createdAt: '2026-01-15T12:00:00Z'
}
```

---

## Template Data Shape

```javascript
// Stored in electron-store as templates[id]
{
  id: 'uuid-v4',
  name: 'xjustiz-migration',
  description: 'XSD diff analysis',
  body: 'Analyse the schema diff between...',
  createdAt: '2026-01-15T12:00:00Z',
  updatedAt: '2026-02-20T10:00:00Z'
}
```

---

## PTY Manager (main process)

```javascript
// pty-manager.js  —  key structure
const pty = require('node-pty');
const sessions = new Map();  // projectId → pty instance

function spawn(projectId, project, cols, rows) {
  const shell = '/bin/bash';
  const args  = [];

  // Build WSL command
  const wslArgs = project.wslDistro
    ? ['-d', project.wslDistro, '--', shell]
    : ['--', shell];

  const proc = pty.spawn('wsl.exe', wslArgs, {
    name: 'xterm-256color',
    cols, rows,
    cwd: process.env.USERPROFILE,
    env: { ...process.env }
  });

  sessions.set(projectId, proc);

  // Run startup commands after shell is ready
  setTimeout(() => {
    for (const cmd of project.startupCommands) {
      proc.write(cmd + '\r');
    }
  }, 500);

  return proc;
}

// Wire up IPC handlers in index.js:
// ipcMain.handle('pty:spawn',  (_, pid, cols, rows) => { ... })
// ipcMain.handle('pty:write',  (_, pid, data)       => sessions.get(pid)?.write(data))
// ipcMain.handle('pty:resize', (_, pid, cols, rows) => sessions.get(pid)?.resize(cols, rows))
// ipcMain.handle('pty:kill',   (_, pid)             => { sessions.get(pid)?.kill(); sessions.delete(pid) })
//
// proc.onData(data => mainWindow.webContents.send(`pty:data:${projectId}`, data))
```

---

## Terminal Component (renderer)

```jsx
// components/Terminal/Terminal.jsx
import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

export function TerminalPane({ projectId }) {
  const containerRef = useRef(null);
  const termRef      = useRef(null);
  const fitRef       = useRef(null);

  useEffect(() => {
    const term = new Terminal({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12,
      lineHeight: 1.5,
      theme: {
        background:  '#0d0e0f',
        foreground:  '#b8b4ae',
        cursor:      '#f5a623',
        cursorAccent:'#0d0e0f',
        black:       '#0d0e0f',
        brightBlack: '#3d3b38',
        // … map full 16-colour palette to design tokens
      },
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current  = fit;

    // Spawn PTY
    const { cols, rows } = term;
    window.agentDeck.pty.spawn(projectId, cols, rows);

    // Stream output into terminal
    const unsub = window.agentDeck.pty.onData(projectId, data => term.write(data));

    // Forward keystrokes to PTY
    term.onData(data => window.agentDeck.pty.write(projectId, data));

    // Resize on container size change
    const ro = new ResizeObserver(() => {
      fit.fit();
      window.agentDeck.pty.resize(projectId, term.cols, term.rows);
    });
    ro.observe(containerRef.current);

    return () => {
      unsub();
      ro.disconnect();
      term.dispose();
      window.agentDeck.pty.kill(projectId);
    };
  }, [projectId]);

  return <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />;
}
```

---

## Split View / Resizable Panes

```jsx
// components/SplitView/SplitView.jsx
// Manages flex widths, drag handles, focus state.
// Key: store widths as pixels during drag, reset to flex:1 on double-click divider.

// State shape:
const [layout, setLayout] = useState(2);   // 1 | 2 | 3
const [focusedPane, setFocus] = useState(0);
// Per-pane widths stored as px during drag, then:
// pane.style.flex = 'none'; pane.style.width = newWidth + 'px';
// On reset: pane.style.flex = '1'; pane.style.width = '';
```

---

## Auto-Detection (New Project Wizard, Step 2)

When the user picks a folder, scan it via the main process:

```javascript
// main: ipcMain.handle('project:detect', async (_, folderPath) => { ... })
async function detectProject(folderPath) {
  const checks = {
    hasPom:      fs.existsSync(path.join(folderPath, 'pom.xml')),
    hasGradle:   fs.existsSync(path.join(folderPath, 'build.gradle')),
    hasPackage:  fs.existsSync(path.join(folderPath, 'package.json')),
    hasAgentsMd: fs.existsSync(path.join(folderPath, 'AGENTS.md')),
    hasClaudeMd: fs.existsSync(path.join(folderPath, 'CLAUDE.md')),
    hasGit:      fs.existsSync(path.join(folderPath, '.git')),
  };
  return {
    badge: checks.hasPom || checks.hasGradle ? 'Java'
         : checks.hasPackage                  ? 'JS'
         : 'Other',
    detected: [
      checks.hasPom      && 'Maven (pom.xml)',
      checks.hasGradle   && 'Gradle (build.gradle)',
      checks.hasPackage  && 'Node (package.json)',
      checks.hasAgentsMd && 'AGENTS.md',
      checks.hasClaudeMd && 'CLAUDE.md',
      checks.hasGit      && 'Git repo',
    ].filter(Boolean),
    suggestedStartup: [
      `cd ${folderPath}`,
      checks.hasPom || checks.hasGradle ? 'claude' : 'claude',
    ],
    contextFile: checks.hasAgentsMd ? 'AGENTS.md'
               : checks.hasClaudeMd ? 'CLAUDE.md'
               : '',
  };
}
```

---

## Command Palette

```jsx
// components/CommandPalette/CommandPalette.jsx
// Triggered by ⌘K / Ctrl+K anywhere in the app.
// Results: active sessions → pinned projects → templates → actions
// Filtering: simple .toLowerCase().includes(query) is fine — no fuzzy lib needed.

useEffect(() => {
  const handler = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setOpen(true);
    }
    if (e.key === 'Escape') setOpen(false);
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

---

## Screen Inventory

| Screen | Trigger | Key component |
|---|---|---|
| Home | App launch, no active session | `screens/Home` |
| Main session | Tab active | `components/Pane` + `components/Terminal` |
| Split view | ⊟ Split button or ⌘\ | `components/SplitView` |
| Command palette | ⌘K | `components/CommandPalette` |
| New project wizard | + New Project button | `screens/NewProjectWizard` (5 steps) |
| Project settings | Gear icon / right-click project | `screens/ProjectSettings` (6 tabs) |
| Template editor | Templates menu item | `screens/TemplateEditor` |

---

## New Project Wizard — Step Order

1. **Choose folder** — path input + browse dialog + display name + WSL distro
2. **Auto-detect** — run detection, show chips, allow badge override
3. **Startup commands** — ordered list (drag to reorder) + env vars
4. **Agent & templates** — agent radio select + template multi-select
5. **Confirm** — summary card + pin toggle → create + immediately open session

---

## Project Settings — Tab Order

1. **General** — name, path, WSL distro, notes, pin toggle, auto-open, badge
2. **Startup** — startup commands + env vars (mask sensitive values)
3. **Agent** — agent picker + custom flags + context file
4. **Templates** — attached template chips + full template list with edit
5. **Identity** — accent colour swatches + icon picker + live preview
6. **Advanced** — scroll buffer, font size, shell + danger zone (clear / reset / remove)

---

## Sensitive Values (env vars)

Use Electron's `safeStorage` API to encrypt API keys at rest:

```javascript
const { safeStorage } = require('electron');
// On save:  safeStorage.encryptString(value)  → store as base64
// On read:  safeStorage.decryptString(Buffer.from(stored, 'base64'))
// Display:  always mask as ●●●●●●●●●● in the UI
```

---

## Build & Run

```bash
npm install
npm run dev       # Electron + Vite hot reload
npm run build     # Production build
npm run dist      # electron-builder → .exe installer
```

```json
// package.json (minimal)
{
  "main": "src/main/index.js",
  "scripts": {
    "dev":   "concurrently \"vite\" \"electron .\"",
    "build": "vite build && electron-builder",
    "dist":  "electron-builder --win"
  },
  "dependencies": {
    "electron-store": "^8",
    "node-pty":        "^1",
    "xterm":           "^5",
    "xterm-addon-fit": "^0.8",
    "react":           "^18",
    "react-dom":       "^18"
  },
  "devDependencies": {
    "electron":         "^29",
    "electron-builder": "^24",
    "vite":             "^5",
    "@vitejs/plugin-react": "^4",
    "concurrently":     "^8"
  }
}
```

---

## Design Reference Files

All mockups are single-file HTML — open in any browser.

| File | Description |
|---|---|
| `agentdeck-home.html` | Home / launch screen |
| `agentdeck-command-palette.html` | ⌘K overlay (interactive) |
| `agentdeck-new-project.html` | New project wizard (interactive, 5 steps) |
| `agentdeck-project-settings.html` | Project settings (interactive, 6 tabs) |
| `agentdeck-template-editor.html` | Template editor (interactive, live preview) |
| `agentdeck-split-view.html` | Split terminal view (interactive, draggable) |

The main session screen (tabs + terminal + sidebar + right panel) is in `agentic-sandbox-ui.html` from the earlier design session.

---

## Notes for Claude Code

- **node-pty must be in main process** — it uses native bindings; importing it in the renderer will crash.
- **xterm.js must mount to a real DOM node** — use `useRef` + `useEffect`, never render it in SSR or before mount.
- **WSL paths vs Windows paths** — the `path` input stores the WSL path (e.g. `/home/rooty/...`). The `cd` command in startup handles navigation; no path translation needed.
- **PTY resize** — debounce the `ResizeObserver` callback at ~80ms to avoid thrashing during split pane drag.
- **Fonts** — bundle JetBrains Mono and Syne locally (in `src/renderer/assets/fonts/`) so the app works offline without a Google Fonts request.
- **electron-builder on Windows** — set `nsis.oneClick: false` for a proper installer with path selection.
- **Context isolation** — keep `contextIsolation: true` and `nodeIntegration: false` in `BrowserWindow`. All Node access goes through the `preload.js` bridge.
