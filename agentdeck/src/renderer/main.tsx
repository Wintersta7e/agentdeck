import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'
import { useAppStore } from './store/appStore'
import { AGENTS } from '../shared/agents'
import { App } from './App'
import './styles/tokens.css'
import './styles/global.css'

async function initAndRender(): Promise<void> {
  // Apply persisted theme before first render to avoid flash
  const theme = await window.agentDeck.theme.get()
  if (theme) {
    document.documentElement.dataset.theme = theme
  }

  // Load persisted visible agents into store (direct set, no IPC write-back)
  const visibleAgents = await window.agentDeck.agents.getVisible()
  if (visibleAgents) {
    useAppStore.setState({ visibleAgents })
  }

  // Load persisted layout prefs
  const layout = await window.agentDeck.layout.get()
  useAppStore.setState({
    ...(layout.sidebarOpen !== undefined && { sidebarOpen: layout.sidebarOpen }),
    ...(layout.sidebarWidth !== undefined && { sidebarWidth: layout.sidebarWidth }),
    ...(layout.sidebarSections !== undefined && {
      sidebarSections: {
        pinned: layout.sidebarSections.pinned ?? true,
        templates: layout.sidebarSections.templates ?? true,
        workflows: layout.sidebarSections.workflows ?? true,
      },
    }),
    ...(layout.rightPanelWidth !== undefined && { rightPanelWidth: layout.rightPanelWidth }),
    ...(layout.wfLogPanelWidth !== undefined && { wfLogPanelWidth: layout.wfLogPanelWidth }),
  })

  // Pre-fetch WSL username + agent detection (parallel, non-blocking on failure)
  const [username, agentStatusResult] = await Promise.all([
    window.agentDeck.app.wslUsername().catch(() => ''),
    window.agentDeck.agents.check().catch(() => ({}) as Record<string, boolean>),
  ])
  useAppStore.setState({ wslUsername: username, agentStatus: agentStatusResult })

  const root = document.getElementById('root')
  if (!root) throw new Error('Root element #root not found')

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )

  // Fire-and-forget: check for agent updates in background (non-blocking)
  // Runs AFTER render so the UI is already interactive
  window.agentDeck.agents.onVersionInfo((info) => {
    const { setAgentVersion, addNotification } = useAppStore.getState()
    setAgentVersion(info.agentId, {
      current: info.current,
      latest: info.latest,
      updateAvailable: info.updateAvailable,
    })
    if (info.updateAvailable && info.current && info.latest) {
      const agent = AGENTS.find((a) => a.id === info.agentId)
      const name = agent?.name ?? info.agentId
      addNotification('info', `Update available: ${name} ${info.current} \u2192 ${info.latest}`)
    }
  })
  window.agentDeck.agents.checkUpdates(agentStatusResult)
}

initAndRender().catch((err: unknown) => {
  const root = document.getElementById('root')
  if (root) {
    const heading = document.createElement('h2')
    heading.textContent = 'Failed to initialize AgentDeck'
    const pre = document.createElement('pre')
    pre.textContent = String(err)
    root.style.cssText = 'color:#e05c5c;padding:32px;font-family:monospace'
    root.appendChild(heading)
    root.appendChild(pre)
  }
})
