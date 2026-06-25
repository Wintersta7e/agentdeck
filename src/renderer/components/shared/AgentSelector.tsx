import { Check } from 'lucide-react'
import type { AgentType } from '../../../shared/types'
import { useAgentRegistry } from '../../hooks/useAgentRegistry'
import './AgentSelector.css'

interface AgentSelectorProps {
  value: AgentType
  onChange: (agent: AgentType) => void
}

export function AgentSelector({ value, onChange }: AgentSelectorProps): React.JSX.Element {
  const registry = useAgentRegistry()
  return (
    <div className="agent-select-grid">
      {registry.map((agent) => {
        const id = agent.id as AgentType
        const selected = value === id
        return (
          <button
            key={agent.id}
            type="button"
            className={`agent-opt ${selected ? 'selected' : ''}`}
            onClick={() => onChange(id)}
          >
            <div className="agent-opt-icon">{agent.icon}</div>
            <div className="agent-opt-name">{agent.name}</div>
            <div className="agent-opt-desc">{agent.description}</div>
            <div className="agent-opt-check">{selected ? <Check size={14} /> : null}</div>
          </button>
        )
      })}
    </div>
  )
}
