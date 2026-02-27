import type { AgentType } from '../../../shared/types'
import './AgentSelector.css'

const KNOWN_AGENTS = [
  { type: 'claude-code' as const, icon: '\u2B21', name: 'claude-code', desc: 'Anthropic CLI' },
  { type: 'codex' as const, icon: '\u25C8', name: 'codex', desc: 'OpenAI CLI' },
  { type: 'aider' as const, icon: '\u25B8', name: 'aider', desc: 'Git-aware' },
  { type: 'goose' as const, icon: '\u25C6', name: 'goose', desc: 'Block open-source' },
  { type: 'gemini-cli' as const, icon: '\u2726', name: 'gemini-cli', desc: 'Google AI' },
  { type: 'amazon-q' as const, icon: '\u25C9', name: 'amazon-q', desc: 'AWS CLI' },
  { type: 'opencode' as const, icon: '\u25CB', name: 'opencode', desc: 'Multi-model' },
]

interface AgentSelectorProps {
  value: AgentType
  onChange: (agent: AgentType) => void
}

export function AgentSelector({ value, onChange }: AgentSelectorProps): React.JSX.Element {
  return (
    <div className="agent-select-grid">
      {KNOWN_AGENTS.map((agent) => (
        <button
          key={agent.type}
          type="button"
          className={`agent-opt ${value === agent.type ? 'selected' : ''}`}
          onClick={() => onChange(agent.type)}
        >
          <div className="agent-opt-icon">{agent.icon}</div>
          <div className="agent-opt-name">{agent.name}</div>
          <div className="agent-opt-desc">{agent.desc}</div>
          <div className="agent-opt-check">{value === agent.type ? '\u2713' : ''}</div>
        </button>
      ))}
    </div>
  )
}
