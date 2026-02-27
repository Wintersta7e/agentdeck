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

initAndRender()
