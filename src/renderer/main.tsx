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

  const root = document.getElementById('root')
  if (!root) throw new Error('Root element #root not found')

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )

  // Listen for version info updates (register before any checkUpdates call)
  const unsubVersionInfo = window.agentDeck.agents.onVersionInfo((info) => {
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

  // Clean up version info listener on window unload
  window.addEventListener('unload', () => unsubVersionInfo())

  // Fetch WSL data after render so the UI is interactive immediately.
  // On WSL cold boot the first call can take 15s+ while the VM starts.
  const fetchWslData = async (): Promise<{
    username: string
    agents: Record<string, boolean>
  }> => {
    const [username, agents, distro] = await Promise.all([
      window.agentDeck.app.wslUsername().catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'init', 'WSL username fetch failed', {
          err: String(err),
        })
        return ''
      }),
      window.agentDeck.agents.check().catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'init', 'Agent check failed', { err: String(err) })
        return {} as Record<string, boolean>
      }),
      window.agentDeck.projects.getDefaultDistro().catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'init', 'WSL distro fetch failed', { err: String(err) })
        return ''
      }),
    ])
    useAppStore.setState({
      wslUsername: username,
      agentStatus: agents,
      wslDistro: typeof distro === 'string' ? distro : '',
    })
    return { username, agents }
  }

  const { username, agents: agentStatusResult } = await fetchWslData()

  // If all agents came back not-found AND username failed, WSL was likely
  // cold-booting.  Retry once after a short delay so the warm VM succeeds.
  const allMissing =
    Object.keys(agentStatusResult).length === 0 || Object.values(agentStatusResult).every((v) => !v)
  if (!username && allMissing) {
    setTimeout(async () => {
      try {
        const { agents: retryAgents } = await fetchWslData()
        // Trigger update checks with the (now hopefully populated) result
        const hasInstalled = Object.values(retryAgents).some((v) => v)
        if (hasInstalled) {
          void window.agentDeck.agents.checkUpdates(retryAgents).catch((err: unknown) => {
            window.agentDeck.log.send('warn', 'init', 'checkUpdates failed', {
              err: String(err),
            })
          })
        }
      } catch (err) {
        window.agentDeck.log.send('warn', 'init', 'WSL retry also failed', { err: String(err) })
      }
    }, 5000)
  } else {
    // WSL was already warm — trigger update checks immediately
    void window.agentDeck.agents.checkUpdates(agentStatusResult).catch((err: unknown) => {
      window.agentDeck.log.send('warn', 'init', 'checkUpdates failed', { err: String(err) })
    })
  }
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
