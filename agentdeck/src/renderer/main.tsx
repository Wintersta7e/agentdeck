import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'
import { useAppStore } from './store/appStore'
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
