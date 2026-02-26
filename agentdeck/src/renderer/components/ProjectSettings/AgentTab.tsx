import type { Project, AgentType } from '../../../shared/types'

interface TabProps {
  draft: Project
  onChange: (updates: Partial<Project>) => void
}

const AGENTS: { type: AgentType; icon: string; name: string; desc: string }[] = [
  { type: 'claude-code', icon: '\u2B21', name: 'claude-code', desc: 'Anthropic CLI agent' },
  { type: 'codex', icon: '\u25C8', name: 'codex', desc: 'OpenAI CLI agent' },
  { type: 'aider', icon: '\u25B8', name: 'aider', desc: 'Git-aware coding assistant' },
]

export function AgentTab({ draft, onChange }: TabProps): React.JSX.Element {
  const selectedAgent = draft.agent ?? 'claude-code'

  return (
    <div className="settings-tab-panel">
      {/* Agent Selection */}
      <div className="settings-section">
        <div className="section-head">
          <div className="section-head-title">Agent Selection</div>
        </div>
        <div className="section-body">
          {AGENTS.map((agent) => {
            const isSelected = selectedAgent === agent.type
            return (
              <div
                key={agent.type}
                className={`agent-row${isSelected ? ' selected' : ''}`}
                onClick={() => onChange({ agent: agent.type })}
              >
                <div className="agent-row-icon">{agent.icon}</div>
                <div className="agent-row-info">
                  <div className="agent-row-name">{agent.name}</div>
                  <div className="agent-row-desc">{agent.desc}</div>
                </div>
                <div className="agent-row-check">{isSelected ? '\u2713' : ''}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Agent Options */}
      <div className="settings-section">
        <div className="section-head">
          <div className="section-head-title">Agent Options</div>
        </div>
        <div className="section-body">
          <div className="form-row">
            <div className="form-label-col">
              <div className="form-label">Custom flags</div>
              <div className="form-sublabel">Appended to the agent command</div>
            </div>
            <div className="form-control-col">
              <input
                type="text"
                className="settings-input"
                value={draft.agentFlags ?? ''}
                onChange={(e) => onChange({ agentFlags: e.target.value })}
                placeholder="e.g. --model claude-opus-4-5"
              />
            </div>
          </div>

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
