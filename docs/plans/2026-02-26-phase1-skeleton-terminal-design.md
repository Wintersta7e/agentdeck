# Phase 1 Design: Skeleton + Terminal

**Goal**: Launch the app and get a working WSL terminal rendering in an Electron window.

## Decisions

- **Build tool**: electron-vite (handles main/preload/renderer builds, native module externals, hot reload)
- **State**: Zustand (single store, minimal boilerplate)
- **Native rebuild**: electron-rebuild postinstall script for node-pty (must match Electron's Node version)
- **Window frame**: `frame: false` for custom titlebar. Known caveat: loses Aero Snap on Windows. Fix later with `titleBarStyle: 'hidden'` + `titleBarOverlay` if needed.

## File Structure

```
agentdeck/
├── src/
│   ├── main/
│   │   ├── index.js          # BrowserWindow, IPC handler registration
│   │   ├── pty-manager.js    # node-pty spawn/write/resize/kill, session Map
│   │   └── preload.js        # contextBridge → window.agentDeck
│   └── renderer/
│       ├── index.html
│       ├── main.jsx           # React root
│       ├── App.jsx            # Titlebar | Terminal | StatusBar
│       ├── styles/
│       │   ├── tokens.css     # CSS custom properties from mockups
│       │   └── global.css     # Reset + base typography + @font-face
│       ├── assets/fonts/      # JetBrains Mono + Syne .woff2
│       ├── components/
│       │   ├── Titlebar/      # Titlebar.jsx + Titlebar.css
│       │   ├── StatusBar/     # StatusBar.jsx + StatusBar.css
│       │   └── Terminal/      # TerminalPane.jsx + TerminalPane.css
│       ├── store/appStore.js  # Zustand (sessions, activeSessionId)
│       └── hooks/usePty.js    # IPC bridge for PTY events
├── electron.vite.config.mjs
├── package.json
└── .gitignore
```

## Components

### Main Process (index.js)
- Frameless BrowserWindow: 1280x800, min 900x600
- contextIsolation: true, nodeIntegration: false
- Registers IPC handlers for pty:spawn, pty:write, pty:resize, pty:kill
- Loads Vite dev server in dev, built HTML in production

### PTY Manager (pty-manager.js)
- `sessions = new Map()` keyed by sessionId
- `spawn(sessionId, cols, rows)` → `wsl.exe -- /bin/bash`, TERM=xterm-256color
- Streams proc.onData to renderer via IPC
- No startup commands or project config in Phase 1 — raw WSL bash shell
- Cleanup all sessions on window close

### Preload (preload.js)
- Exposes `window.agentDeck.pty` only (spawn, write, resize, kill, onData)
- No projects/templates surface yet

### TerminalPane
- xterm.js Terminal + FitAddon
- Theme colours from design tokens
- useEffect lifecycle: create → fit → spawn PTY → wire bidirectional data → ResizeObserver
- Cleanup: dispose terminal, kill PTY
- Takes `sessionId` prop (hardcoded "default" for Phase 1)

### Titlebar
- Traffic light dots, hexagonal amber logo, "AgentDeck" wordmark
- Center text (view name), right buttons (placeholder, non-functional)
- -webkit-app-region: drag for window dragging

### StatusBar
- Static: "WSL2 · Ubuntu-24.04", "v0.1.0-alpha"

### App.jsx
- Vertical flex: Titlebar | TerminalPane (flex:1) | StatusBar
- No sidebar, tabs, or split view

### Zustand Store (minimal)
- sessions: { default: { id, status } }
- activeSessionId: 'default'

## Native Module Rebuild

node-pty must be rebuilt against Electron's Node version:
```json
"postinstall": "electron-rebuild -f -w node-pty"
```
Without this: silent failure or NODE_MODULE_VERSION mismatch.
