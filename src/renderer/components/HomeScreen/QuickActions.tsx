import { Zap, Play, FileText, RotateCcw } from 'lucide-react'
import './QuickActions.css'

interface QuickActionsProps {
  onNewSession: () => void
  onRunWorkflow: () => void
  onFromTemplate: () => void
  onResumeLast: () => void
  resumeDisabled: boolean
}

const ACTIONS = [
  {
    key: 'session',
    icon: Zap,
    label: 'New Session',
    sub: 'Pick project + agent',
    kbd: 'Ctrl+N',
    color: 'var(--accent)',
  },
  {
    key: 'workflow',
    icon: Play,
    label: 'Run Workflow',
    sub: 'Execute a saved pipeline',
    kbd: 'Ctrl+R',
    color: 'var(--purple)',
  },
  {
    key: 'template',
    icon: FileText,
    label: 'From Template',
    sub: 'Start with a prompt',
    kbd: 'Ctrl+T',
    color: 'var(--blue)',
  },
  {
    key: 'resume',
    icon: RotateCcw,
    label: 'Resume Last',
    sub: 'Continue working',
    kbd: 'Ctrl+L',
    color: 'var(--green)',
  },
] as const

export function QuickActions({
  onNewSession,
  onRunWorkflow,
  onFromTemplate,
  onResumeLast,
  resumeDisabled,
}: QuickActionsProps): React.JSX.Element {
  const handlers: Record<string, () => void> = {
    session: onNewSession,
    workflow: onRunWorkflow,
    template: onFromTemplate,
    resume: onResumeLast,
  }

  return (
    <div className="quick-actions">
      {ACTIONS.map((a) => {
        const Icon = a.icon
        const disabled = a.key === 'resume' && resumeDisabled
        return (
          <button
            key={a.key}
            className={`quick-action${disabled ? ' disabled' : ''}`}
            onClick={handlers[a.key]}
            disabled={disabled}
            type="button"
            aria-label={a.label}
          >
            <span className="quick-action-icon" style={{ color: a.color }}>
              <Icon size={16} />
            </span>
            <span className="quick-action-body">
              <span className="quick-action-label">{a.label}</span>
              <span className="quick-action-sub">{a.sub}</span>
            </span>
            <kbd className="quick-action-kbd">{a.kbd}</kbd>
          </button>
        )
      })}
    </div>
  )
}
