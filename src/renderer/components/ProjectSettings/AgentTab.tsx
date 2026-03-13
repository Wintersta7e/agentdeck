import { useState } from 'react'
import { SquareCheck, Square, Star, ChevronUp, ChevronDown } from 'lucide-react'
import { AGENTS as SHARED_AGENTS } from '../../../shared/agents'
import type { Project, AgentType } from '../../../shared/types'
import { getProjectAgents } from '../../../shared/agent-helpers'

interface TabProps {
  draft: Project
  onChange: (updates: Partial<Project>) => void
}

export function AgentTab({ draft, onChange }: TabProps): React.JSX.Element {
  const agents = getProjectAgents(draft)
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)

  function isEnabled(agentId: AgentType): boolean {
    return agents.some((a) => a.agent === agentId)
  }

  function getDefault(): AgentType {
    return agents.find((a) => a.isDefault)?.agent ?? agents[0]?.agent ?? 'claude-code'
  }

  function toggleAgent(agentId: AgentType): void {
    const current = [...agents]
    const idx = current.findIndex((a) => a.agent === agentId)
    if (idx >= 0) {
      // Don't allow removing the last agent
      if (current.length <= 1) return
      const removed = current[idx]
      current.splice(idx, 1)
      // If removing the default, mark the first remaining as default
      if (removed?.isDefault && current.length > 0) {
        const first = current[0]
        if (first) {
          current[0] = { ...first, isDefault: true }
        }
      }
      // Collapse if we're disabling the expanded agent
      if (expandedAgent === agentId) setExpandedAgent(null)
    } else {
      current.push({ agent: agentId })
    }
    onChange({ agents: current })
  }

  function setDefault(agentId: AgentType): void {
    const updated = agents.map((a) => ({
      ...a,
      isDefault: a.agent === agentId ? true : undefined,
    }))
    onChange({ agents: updated })
  }

  function updateAgentFlags(agentId: AgentType, flags: string): void {
    const updated = agents.map((a) =>
      a.agent === agentId ? { ...a, agentFlags: flags || undefined } : a,
    )
    onChange({ agents: updated })
  }

  function getAgentFlags(agentId: AgentType): string {
    return agents.find((a) => a.agent === agentId)?.agentFlags ?? ''
  }

  return (
    <div className="settings-tab-panel">
      <div className="settings-section">
        <div className="section-head">
          <div className="section-head-title">Agents</div>
          <div className="section-head-sub">Check agents to enable, star one as default</div>
        </div>
        <div className="section-body">
          {SHARED_AGENTS.map((agentDef) => {
            const enabled = isEnabled(agentDef.id)
            const isDefaultAgent = getDefault() === agentDef.id
            const isExpanded = expandedAgent === agentDef.id && enabled
            return (
              <div key={agentDef.id} className="agent-multi-row">
                <div
                  className={`agent-row${enabled ? ' selected' : ''}`}
                  onClick={() => toggleAgent(agentDef.id)}
                >
                  <div className="agent-row-check">
                    {enabled ? <SquareCheck size={16} /> : <Square size={16} />}
                  </div>
                  <div className="agent-row-icon">{agentDef.icon}</div>
                  <div className="agent-row-info">
                    <div className="agent-row-name">{agentDef.name}</div>
                    <div className="agent-row-desc">{agentDef.description}</div>
                  </div>
                  {enabled && (
                    <button
                      className={`agent-star-btn${isDefaultAgent ? ' active' : ''}`}
                      title={isDefaultAgent ? 'Default agent' : 'Set as default'}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDefault(agentDef.id)
                      }}
                    >
                      <Star size={14} fill={isDefaultAgent ? 'currentColor' : 'none'} />
                    </button>
                  )}
                  {enabled && (
                    <button
                      className="agent-expand-btn"
                      title="Configure flags"
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedAgent(isExpanded ? null : agentDef.id)
                      }}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                </div>
                {isExpanded && (
                  <div className="agent-flags-panel">
                    <div className="form-row">
                      <div className="form-label-col">
                        <div className="form-label">Custom flags</div>
                        <div className="form-sublabel">Appended to the agent command</div>
                      </div>
                      <div className="form-control-col">
                        <input
                          type="text"
                          className="settings-input"
                          value={getAgentFlags(agentDef.id)}
                          onChange={(e) => updateAgentFlags(agentDef.id, e.target.value)}
                          maxLength={200}
                          placeholder="e.g. --model claude-opus-4-5"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Context File — shared across all agents */}
      <div className="settings-section">
        <div className="section-head">
          <div className="section-head-title">Context File</div>
        </div>
        <div className="section-body">
          <div className="form-row">
            <div className="form-label-col">
              <div className="form-label">Context file</div>
              <div className="form-sublabel">Loaded into the agent context</div>
            </div>
            <div className="form-control-col">
              <input
                type="text"
                className="settings-input"
                value={draft.contextFile ?? ''}
                onChange={(e) => onChange({ contextFile: e.target.value })}
                placeholder="AGENTS.md"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
