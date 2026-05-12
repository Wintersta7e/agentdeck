import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../App'
import { ErrorBoundary } from '../components/ErrorBoundary/ErrorBoundary'

export function renderAppRoot(): void {
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
