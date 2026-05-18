import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import './ErrorBoundary.css'

/**
 * Build a privacy-conscious snapshot of app state at crash time. Captures
 * only counts, enum values, and ID hashes — no paths, no names, no
 * usernames, no full UUIDs. Production logs ship to a local file
 * (`app.getPath('logs')/agentdeck.log`) that the user controls; this
 * payload is safe to share when filing a bug report.
 */
function captureCrashContext(): string {
  try {
    const s = useAppStore.getState()
    const sessions = Object.values(s.sessions ?? {})
    const tail = (id: string | null | undefined): string => (id ? id.slice(-8) : 'none')
    const ctx = {
      view: s.currentView ?? 'unknown',
      activeSession: tail(s.activeSessionId),
      activeWorkflow: tail(s.activeWorkflowId),
      sessionsTotal: sessions.length,
      sessionsRunning: sessions.filter((sess) => sess.status === 'running').length,
      sessionsExited: sessions.filter((sess) => sess.status === 'exited').length,
      workflowsOpen: (s.openWorkflowIds ?? []).length,
      notifications: (s.notifications ?? []).length,
    }
    return `\n[crash-ctx] ${JSON.stringify(ctx)}`
  } catch {
    // Store may be partially initialised at very-early crashes — never let
    // diagnostic capture itself derail the error log path.
    return '\n[crash-ctx] unavailable'
  }
}

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const message = `${error.name}: ${error.message}\n${errorInfo.componentStack ?? ''}${captureCrashContext()}`
    window.agentDeck?.log?.send('error', 'ErrorBoundary', message).catch(() => {})
  }

  handleReload = (): void => {
    window.location.reload()
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-icon">
            <AlertTriangle size={32} />
          </div>
          <div className="error-boundary-title">Something went wrong</div>
          <div className="error-boundary-message">
            AgentDeck encountered an unexpected error. Your sessions are still running in the
            background. Click reload to restart the interface.
          </div>
          {this.state.error && (
            <div className="error-boundary-details">{this.state.error.message}</div>
          )}
          <button className="error-boundary-reload" onClick={this.handleReload}>
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
