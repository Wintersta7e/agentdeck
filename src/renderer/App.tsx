import { useCallback, useState } from 'react'
import { Titlebar } from './components/Titlebar/Titlebar'
import { TopTabBar } from './components/TopTabBar/TopTabBar'
import { StatusBar } from './components/StatusBar/StatusBar'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { AboutDialog } from './components/AboutDialog/AboutDialog'
import { ShortcutsDialog } from './components/ShortcutsDialog/ShortcutsDialog'
import { NotificationToast } from './components/NotificationToast/NotificationToast'
import { SessionWorkspace } from './components/SessionWorkspace/SessionWorkspace'
import { AppRoutes } from './AppRoutes'
import { useAppStore } from './store/appStore'
import { useAppIpcBridge } from './hooks/useAppIpcBridge'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { useProjectSessionLauncher } from './hooks/useProjectSessionLauncher'
import './App.css'

export function App(): React.JSX.Element {
  const wslAvailable = useAppStore((s) => s.wslAvailable)
  const { openTerminal, openProject, openProjectWithAgent } = useProjectSessionLauncher()

  const [aboutOpen, setAboutOpen] = useState(false)
  const openAbout = useCallback(() => setAboutOpen(true), [])
  const closeAbout = useCallback(() => setAboutOpen(false), [])

  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const openShortcuts = useCallback(() => setShortcutsOpen(true), [])
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), [])
  const toggleShortcuts = useCallback(() => setShortcutsOpen((prev) => !prev), [])

  useAppIpcBridge()
  useGlobalShortcuts({ onNewTerminal: openTerminal, onToggleShortcuts: toggleShortcuts })

  return (
    <div className="app">
      <Titlebar />
      <TopTabBar />
      <div className="app-body">
        {wslAvailable === false && (
          <div className="wsl-warning-banner" role="alert">
            WSL not detected - check that your distribution is running
          </div>
        )}
        <div className="app-main">
          <AppRoutes onOpenProject={openProject} onOpenProjectWithAgent={openProjectWithAgent} />
          <SessionWorkspace />
        </div>
      </div>
      <StatusBar onAboutClick={openAbout} onShortcutsClick={openShortcuts} />
      <CommandPalette
        onOpenProject={openProject}
        onAbout={openAbout}
        onShortcuts={openShortcuts}
        onNewTerminal={openTerminal}
      />
      {aboutOpen && <AboutDialog onClose={closeAbout} />}
      {shortcutsOpen && <ShortcutsDialog onClose={closeShortcuts} />}
      <NotificationToast />
    </div>
  )
}
