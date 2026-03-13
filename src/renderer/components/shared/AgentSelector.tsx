import { Check } from 'lucide-react'
import { AGENTS } from '../../../shared/agents'
import type { AgentType } from '../../../shared/types'
import './AgentSelector.css'

const KNOWN_AGENTS = AGENTS.map((a) => ({
  type: a.id,
  icon: a.icon,
  name: a.id,
  desc: a.description,
}))

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
          <div className="agent-opt-check">{value === agent.type ? <Check size={14} /> : null}</div>
        </button>
      ))}
    </div>
  )
}
