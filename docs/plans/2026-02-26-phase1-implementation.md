# Phase 1: Skeleton + Terminal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Launch an Electron app that renders a working WSL terminal with custom titlebar and status bar.

**Architecture:** electron-vite builds three targets (main, preload, renderer). Main process spawns WSL bash via node-pty, streams data to renderer over IPC. Renderer renders it with xterm.js. React + Zustand for UI state. Custom frameless window with hand-rolled titlebar.

**Tech Stack:** Electron 29, React 18, Vite (via electron-vite), xterm.js 5, node-pty, Zustand, plain CSS

---

### Task 1: Scaffold project and install dependencies

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.mjs`

**Step 1: Create package.json**

```json
{
  "name": "agentdeck",
  "version": "0.1.0-alpha",
  "description": "Electron desktop app for managing WSL agent sessions",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "postinstall": "electron-rebuild -f -w node-pty"
  },
  "dependencies": {
    "node-pty": "^1.0.0",
    "xterm": "^5.5.0",
    "xterm-addon-fit": "^0.8.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.0",
    "@fontsource/jetbrains-mono": "^5.1.1",
    "@fontsource-variable/syne": "^5.1.0"
  },
  "devDependencies": {
    "electron": "^29.4.6",
    "electron-vite": "^2.3.0",
    "electron-rebuild": "^3.2.9",
    "@vitejs/plugin-react": "^4.3.4"
  }
}
```

**Step 2: Create electron.vite.config.mjs**

```javascript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
```

**Step 3: Run npm install**

Run: `npm install`
Expected: All deps install. postinstall triggers `electron-rebuild -f -w node-pty`. Watch for node-pty rebuild success (should say "Rebuild Complete").

If electron-rebuild fails with missing headers, run: `npx electron-rebuild -f -w node-pty` manually and check error output.

**Step 4: Commit**

```bash
git add package.json package-lock.json electron.vite.config.mjs
git commit -m "scaffold: init package.json and electron-vite config"
```

---

### Task 2: Create main process entry point

**Files:**
- Create: `src/main/index.js`

**Step 1: Write index.js**

```javascript
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { createPtyManager } from './pty-manager'

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0d0e0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const ptyManager = createPtyManager(mainWindow)

  // PTY IPC handlers
  ipcMain.handle('pty:spawn', (_, sessionId, cols, rows) => {
    ptyManager.spawn(sessionId, cols, rows)
  })
  ipcMain.handle('pty:write', (_, sessionId, data) => {
    ptyManager.write(sessionId, data)
  })
  ipcMain.handle('pty:resize', (_, sessionId, cols, rows) => {
    ptyManager.resize(sessionId, cols, rows)
  })
  ipcMain.handle('pty:kill', (_, sessionId) => {
    ptyManager.kill(sessionId)
  })

  // Load renderer
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    ptyManager.killAll()
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})
```

**Step 2: Verify file exists**

Run: `ls -la src/main/index.js`
Expected: File exists.

**Step 3: Commit**

```bash
git add src/main/index.js
git commit -m "feat: add Electron main process entry point"
```

---

### Task 3: Create PTY manager

**Files:**
- Create: `src/main/pty-manager.js`

**Step 1: Write pty-manager.js**

```javascript
import pty from 'node-pty'

export function createPtyManager(mainWindow) {
  const sessions = new Map()

  function spawn(sessionId, cols, rows) {
    if (sessions.has(sessionId)) {
      kill(sessionId)
    }

    const proc = pty.spawn('wsl.exe', ['--', '/bin/bash'], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: process.env.USERPROFILE,
      env: { ...process.env }
    })

    sessions.set(sessionId, proc)

    proc.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`pty:data:${sessionId}`, data)
      }
    })

    proc.onExit(({ exitCode }) => {
      sessions.delete(sessionId)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`pty:exit:${sessionId}`, exitCode)
      }
    })
  }

  function write(sessionId, data) {
    const proc = sessions.get(sessionId)
    if (proc) proc.write(data)
  }

  function resize(sessionId, cols, rows) {
    const proc = sessions.get(sessionId)
    if (proc) proc.resize(cols, rows)
  }

  function kill(sessionId) {
    const proc = sessions.get(sessionId)
    if (proc) {
      proc.kill()
      sessions.delete(sessionId)
    }
  }

  function killAll() {
    for (const [id] of sessions) {
      kill(id)
    }
  }

  return { spawn, write, resize, kill, killAll }
}
```

**Step 2: Commit**

```bash
git add src/main/pty-manager.js
git commit -m "feat: add PTY manager for WSL session spawning"
```

---

### Task 4: Create preload script

**Files:**
- Create: `src/preload/index.js`

**Step 1: Write preload script**

Note: electron-vite expects preload in `src/preload/`, not `src/main/preload.js`.

```javascript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('agentDeck', {
  pty: {
    spawn: (sessionId, cols, rows) =>
      ipcRenderer.invoke('pty:spawn', sessionId, cols, rows),
    write: (sessionId, data) =>
      ipcRenderer.invoke('pty:write', sessionId, data),
    resize: (sessionId, cols, rows) =>
      ipcRenderer.invoke('pty:resize', sessionId, cols, rows),
    kill: (sessionId) =>
      ipcRenderer.invoke('pty:kill', sessionId),
    onData: (sessionId, cb) => {
      const channel = `pty:data:${sessionId}`
      const listener = (_, data) => cb(data)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (sessionId, cb) => {
      const channel = `pty:exit:${sessionId}`
      const listener = (_, exitCode) => cb(exitCode)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    }
  }
})
```

**Step 2: Commit**

```bash
git add src/preload/index.js
git commit -m "feat: add preload script with PTY IPC bridge"
```

---

### Task 5: Create design tokens and global CSS

**Files:**
- Create: `src/renderer/styles/tokens.css`
- Create: `src/renderer/styles/global.css`

**Step 1: Write tokens.css**

Verbatim from the handoff, plus `--amber-dim` and extra colours used in the mockups:

```css
:root {
  /* Backgrounds — layered from darkest to lightest */
  --bg0: #0d0e0f;
  --bg1: #111213;
  --bg2: #161718;
  --bg3: #1c1d1f;
  --bg4: #222325;

  /* Borders */
  --border: #2a2b2d;
  --border-bright: #363739;

  /* Text hierarchy */
  --text0: #f0ede8;
  --text1: #b8b4ae;
  --text2: #6e6b66;
  --text3: #3d3b38;

  /* Accent colours */
  --amber: #f5a623;
  --amber-dim: #c07d0f;
  --amber-glow: rgba(245, 166, 35, 0.12);
  --amber-glow2: rgba(245, 166, 35, 0.06);

  --green: #4caf7d;
  --green-dim: rgba(76, 175, 125, 0.12);

  --red: #e05c5c;
  --red-dim: rgba(224, 92, 92, 0.12);

  --blue: #5b9bd5;
  --blue-dim: rgba(91, 155, 213, 0.12);

  --purple: #9b72cf;

  /* Shape */
  --r: 4px;

  /* Typography */
  --font-mono: 'JetBrains Mono', monospace;
  --font-display: 'Syne Variable', 'Syne', sans-serif;
}
```

**Step 2: Write global.css**

```css
@import '@fontsource/jetbrains-mono/300.css';
@import '@fontsource/jetbrains-mono/400.css';
@import '@fontsource/jetbrains-mono/500.css';
@import '@fontsource/jetbrains-mono/600.css';
@import '@fontsource-variable/syne';

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  height: 100%;
  overflow: hidden;
}

body {
  background: var(--bg0);
  color: var(--text0);
  font-family: var(--font-mono);
  font-size: 12px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Scrollbar defaults */
::-webkit-scrollbar {
  width: 4px;
}
::-webkit-scrollbar-thumb {
  background: var(--bg4);
  border-radius: 2px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
```

**Step 3: Commit**

```bash
git add src/renderer/styles/
git commit -m "feat: add design tokens and global CSS with bundled fonts"
```

---

### Task 6: Create renderer entry point and React root

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/main.jsx`

**Step 1: Write index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentDeck</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.jsx"></script>
</body>
</html>
```

**Step 2: Write main.jsx**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/tokens.css'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

**Step 3: Commit**

```bash
git add src/renderer/index.html src/renderer/main.jsx
git commit -m "feat: add renderer entry point and React root"
```

---

### Task 7: Create Zustand store

**Files:**
- Create: `src/renderer/store/appStore.js`

**Step 1: Write minimal store**

```javascript
import { create } from 'zustand'

export const useAppStore = create((set) => ({
  // Sessions
  sessions: {},
  activeSessionId: null,

  addSession: (id) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: { id, status: 'starting' }
      },
      activeSessionId: id
    })),

  setSessionStatus: (id, status) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: { ...state.sessions[id], status }
      }
    })),

  removeSession: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.sessions
      return {
        sessions: rest,
        activeSessionId: state.activeSessionId === id
          ? Object.keys(rest)[0] || null
          : state.activeSessionId
      }
    }),

  // UI state
  currentView: 'terminal'
}))
```

**Step 2: Commit**

```bash
git add src/renderer/store/appStore.js
git commit -m "feat: add Zustand store with session state"
```

---

### Task 8: Create Titlebar component

**Files:**
- Create: `src/renderer/components/Titlebar/Titlebar.jsx`
- Create: `src/renderer/components/Titlebar/Titlebar.css`

**Step 1: Write Titlebar.css**

Extract styles from `agentdeck-home.html` `.titlebar` section:

```css
.titlebar {
  height: 36px;
  background: var(--bg0);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 12px;
  flex-shrink: 0;
  -webkit-app-region: drag;
  position: relative;
}

.titlebar-controls {
  display: flex;
  gap: 6px;
  -webkit-app-region: no-drag;
}

.control {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  cursor: pointer;
}
.control-close { background: var(--red); }
.control-min { background: var(--amber); }
.control-max { background: var(--green); }

.titlebar-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
}

.logo-mark {
  width: 18px;
  height: 18px;
  background: var(--amber);
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}

.logo-text {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 13px;
  color: var(--text0);
  letter-spacing: 0.05em;
}
.logo-text span {
  color: var(--amber);
}

.titlebar-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--text2);
  letter-spacing: 0.08em;
}

.titlebar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.titlebar-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text2);
  padding: 3px 8px;
  border-radius: var(--r);
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  letter-spacing: 0.05em;
  transition: all 0.15s;
}
.titlebar-btn:hover {
  border-color: var(--amber);
  color: var(--amber);
}
.titlebar-btn.primary {
  border-color: var(--amber);
  color: var(--amber);
  background: var(--amber-glow);
}
```

**Step 2: Write Titlebar.jsx**

```jsx
import './Titlebar.css'

export function Titlebar({ centerText = '' }) {
  return (
    <div className="titlebar">
      <div className="titlebar-controls">
        <div className="control control-close" />
        <div className="control control-min" />
        <div className="control control-max" />
      </div>
      <div className="titlebar-logo">
        <div className="logo-mark" />
        <div className="logo-text">
          Agent<span>Deck</span>
        </div>
      </div>
      {centerText && <div className="titlebar-center">{centerText}</div>}
      <div className="titlebar-right">
        <button className="titlebar-btn">Ctrl+K Command</button>
        <button className="titlebar-btn primary">+ New Project</button>
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/Titlebar/
git commit -m "feat: add Titlebar component with logo and window controls"
```

---

### Task 9: Create StatusBar component

**Files:**
- Create: `src/renderer/components/StatusBar/StatusBar.jsx`
- Create: `src/renderer/components/StatusBar/StatusBar.css`

**Step 1: Write StatusBar.css**

```css
.statusbar {
  height: 22px;
  background: var(--bg0);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 16px;
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text2);
}

.status-item {
  display: flex;
  align-items: center;
  gap: 5px;
}
.status-item.green { color: var(--green); }
.status-item.amber { color: var(--amber); }

.status-right {
  margin-left: auto;
}

.status-sep {
  color: var(--text3);
  font-size: 8px;
}
```

**Step 2: Write StatusBar.jsx**

```jsx
import { useAppStore } from '../../store/appStore'
import './StatusBar.css'

export function StatusBar() {
  const sessions = useAppStore((s) => s.sessions)
  const activeCount = Object.values(sessions).filter(
    (s) => s.status === 'running'
  ).length

  return (
    <div className="statusbar">
      <div className={`status-item ${activeCount > 0 ? 'green' : ''}`}>
        <span>&#x2B21;</span>
        <span>
          {activeCount} session{activeCount !== 1 ? 's' : ''} active
        </span>
      </div>
      <span className="status-sep">|</span>
      <div className="status-item">WSL2 · Ubuntu-24.04</div>
      <div className="status-right">v0.1.0-alpha</div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/StatusBar/
git commit -m "feat: add StatusBar component"
```

---

### Task 10: Create TerminalPane component

**Files:**
- Create: `src/renderer/components/Terminal/TerminalPane.jsx`
- Create: `src/renderer/components/Terminal/TerminalPane.css`

**Step 1: Write TerminalPane.css**

```css
.terminal-container {
  flex: 1;
  overflow: hidden;
  background: var(--bg0);
}
```

**Step 2: Write TerminalPane.jsx**

```jsx
import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useAppStore } from '../../store/appStore'
import './TerminalPane.css'

export function TerminalPane({ sessionId }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitRef = useRef(null)
  const setSessionStatus = useAppStore((s) => s.setSessionStatus)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12,
      lineHeight: 1.5,
      cursorBlink: true,
      theme: {
        background: '#0d0e0f',
        foreground: '#b8b4ae',
        cursor: '#f5a623',
        cursorAccent: '#0d0e0f',
        selectionBackground: 'rgba(245, 166, 35, 0.2)',
        black: '#0d0e0f',
        red: '#e05c5c',
        green: '#4caf7d',
        yellow: '#f5a623',
        blue: '#5b9bd5',
        magenta: '#9b72cf',
        cyan: '#5b9bd5',
        white: '#b8b4ae',
        brightBlack: '#3d3b38',
        brightRed: '#e05c5c',
        brightGreen: '#4caf7d',
        brightYellow: '#f5a623',
        brightBlue: '#5b9bd5',
        brightMagenta: '#9b72cf',
        brightCyan: '#5b9bd5',
        brightWhite: '#f0ede8'
      },
      scrollback: 5000
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    // Spawn PTY with terminal dimensions
    const { cols, rows } = term
    window.agentDeck.pty.spawn(sessionId, cols, rows)
    setSessionStatus(sessionId, 'running')

    // Stream PTY output into terminal
    const unsubData = window.agentDeck.pty.onData(sessionId, (data) => {
      term.write(data)
    })

    // Forward keystrokes to PTY
    const onDataDisposable = term.onData((data) => {
      window.agentDeck.pty.write(sessionId, data)
    })

    // Handle PTY exit
    const unsubExit = window.agentDeck.pty.onExit(sessionId, () => {
      setSessionStatus(sessionId, 'exited')
    })

    // Resize PTY when container changes size
    let resizeTimeout
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        if (fitRef.current && containerRef.current) {
          fit.fit()
          window.agentDeck.pty.resize(sessionId, term.cols, term.rows)
        }
      }, 80)
    })
    ro.observe(containerRef.current)

    return () => {
      clearTimeout(resizeTimeout)
      unsubData()
      unsubExit()
      onDataDisposable.dispose()
      ro.disconnect()
      term.dispose()
      window.agentDeck.pty.kill(sessionId)
    }
  }, [sessionId])

  return <div ref={containerRef} className="terminal-container" />
}
```

Note the 80ms debounce on ResizeObserver as required by the design constraints.

**Step 3: Commit**

```bash
git add src/renderer/components/Terminal/
git commit -m "feat: add TerminalPane with xterm.js and PTY integration"
```

---

### Task 11: Create App shell and wire everything together

**Files:**
- Create: `src/renderer/App.jsx`
- Create: `src/renderer/App.css`

**Step 1: Write App.css**

```css
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}
```

**Step 2: Write App.jsx**

```jsx
import { useEffect } from 'react'
import { Titlebar } from './components/Titlebar/Titlebar'
import { StatusBar } from './components/StatusBar/StatusBar'
import { TerminalPane } from './components/Terminal/TerminalPane'
import { useAppStore } from './store/appStore'
import './App.css'

const DEFAULT_SESSION = 'default'

export function App() {
  const addSession = useAppStore((s) => s.addSession)
  const activeSessionId = useAppStore((s) => s.activeSessionId)

  useEffect(() => {
    addSession(DEFAULT_SESSION)
  }, [])

  return (
    <div className="app">
      <Titlebar centerText="AgentDeck — Terminal" />
      <div className="app-main">
        {activeSessionId && <TerminalPane sessionId={activeSessionId} />}
      </div>
      <StatusBar />
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/renderer/App.jsx src/renderer/App.css
git commit -m "feat: wire App shell with Titlebar, Terminal, StatusBar"
```

---

### Task 12: First launch — verify the full pipeline works

**Step 1: Run the dev server**

Run: `npm run dev`

Expected: electron-vite compiles all three targets (main, preload, renderer), then launches an Electron window showing:
- Custom titlebar at top with logo and buttons
- A full-size WSL bash terminal in the middle (you can type commands, see output, colours work)
- Status bar at the bottom

**Step 2: Verify terminal interaction**

In the terminal pane:
- Type `ls` and press Enter — should see file listing
- Type `echo $TERM` — should print `xterm-256color`
- Colours should match the design tokens (amber prompt, green for success, etc. if your shell is configured)
- Resize the window — terminal should reflow correctly

**Step 3: Verify window controls**

- The titlebar should be draggable (move the window around)
- Traffic light dots should be visible (close/min/max — non-functional in Phase 1 is fine, Electron handles OS-level close)

**Step 4: If anything fails**

Common issues:
- **node-pty NODE_MODULE_VERSION mismatch**: run `npx electron-rebuild -f -w node-pty` and restart
- **WSL not found**: ensure WSL2 is installed and a default distro is set (`wsl --list --verbose`)
- **Blank terminal**: check DevTools console (Ctrl+Shift+I) for errors in PTY spawn or IPC
- **Fonts not loading**: check that @fontsource imports are in global.css and tokens.css has correct font family names

**Step 5: Commit working state**

```bash
git add -A
git commit -m "feat: Phase 1 complete — working WSL terminal in Electron"
```

---

## Summary

| Task | What | Key files |
|------|------|-----------|
| 1 | Scaffold + install | `package.json`, `electron.vite.config.mjs` |
| 2 | Main process | `src/main/index.js` |
| 3 | PTY manager | `src/main/pty-manager.js` |
| 4 | Preload IPC bridge | `src/preload/index.js` |
| 5 | Design tokens + CSS | `src/renderer/styles/tokens.css`, `global.css` |
| 6 | Renderer entry | `src/renderer/index.html`, `main.jsx` |
| 7 | Zustand store | `src/renderer/store/appStore.js` |
| 8 | Titlebar | `src/renderer/components/Titlebar/` |
| 9 | StatusBar | `src/renderer/components/StatusBar/` |
| 10 | TerminalPane | `src/renderer/components/Terminal/` |
| 11 | App shell | `src/renderer/App.jsx`, `App.css` |
| 12 | First launch + verify | Run `npm run dev`, test the pipeline |
