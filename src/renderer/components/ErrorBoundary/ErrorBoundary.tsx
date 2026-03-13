import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import './ErrorBoundary.css'

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

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const message = `${error.name}: ${error.message}\n${errorInfo.componentStack ?? ''}`
    window.agentDeck?.log?.send('error', 'ErrorBoundary', message).catch(() => {})
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
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
