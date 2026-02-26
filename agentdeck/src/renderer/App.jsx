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
