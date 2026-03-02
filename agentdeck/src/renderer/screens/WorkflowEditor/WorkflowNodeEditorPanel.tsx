import { useCallback, useMemo } from 'react'
import type { WorkflowNode, WorkflowNodeStatus, AgentType, Role } from '../../../shared/types'
import { AGENTS } from '../../../shared/agents'
import { useAppStore } from '../../store/appStore'
import './WorkflowNodeEditorPanel.css'

interface Props {
  node: WorkflowNode
  nodeStatuses: Record<string, WorkflowNodeStatus>
  onUpdateNode: (node: WorkflowNode) => void
  onClose: () => void
}

const KNOWN_AGENTS: AgentType[] = AGENTS.map((a) => a.id)

export default function WorkflowNodeEditorPanel({
  node,
  nodeStatuses,
  onUpdateNode,
  onClose,
}: Props): React.JSX.Element {
  const roles = useAppStore((s) => s.roles)
  const rolesMap = useMemo(() => new Map<string, Role>(roles.map((r) => [r.id, r])), [roles])
  const role = node.roleId ? rolesMap.get(node.roleId) : undefined

  const update = useCallback(
    (patch: Partial<WorkflowNode>) => {
      onUpdateNode({ ...node, ...patch })
    },
    [node, onUpdateNode],
  )

  return (
    <div className="wf-node-editor">
      <div className="wf-ne-header">
        <span className="wf-ne-title">{node.name}</span>
        <button className="wf-ne-close" onClick={onClose} type="button">
          {'\u00D7'}
        </button>
      </div>

      <div className="wf-ne-body">
        {/* Name */}
        <div className="wf-ne-field">
          <label className="wf-ne-label">Name</label>
          <input
            className="wf-ne-input"
            value={node.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </div>

        {/* Type (read-only) */}
        <div className="wf-ne-field">
          <label className="wf-ne-label">Type</label>
          <div className="wf-ne-value">{node.type}</div>
        </div>

        {/* Status (read-only) */}
        <div className="wf-ne-field">
          <label className="wf-ne-label">Status</label>
          <div className="wf-ne-value">{nodeStatuses[node.id] ?? 'idle'}</div>
        </div>

        {/* Agent dropdown (agent nodes only) */}
        {node.type === 'agent' && (
          <div className="wf-ne-field">
            <label className="wf-ne-label">Agent</label>
            <select
              className="wf-ne-select"
              value={node.agent ?? 'claude-code'}
              onChange={(e) => update({ agent: e.target.value as AgentType })}
            >
              {KNOWN_AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Role dropdown (agent nodes only) */}
        {node.type === 'agent' && (
          <div className="wf-ne-field wf-ne-field-role">
            <label className="wf-ne-label">Role</label>
            <select
              className="wf-ne-select wf-ne-role-select"
              value={node.roleId ?? ''}
              onChange={(e) => update({ roleId: e.target.value || undefined })}
            >
              <option value="">No role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.icon} {r.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Persona preview (when role selected) */}
        {node.type === 'agent' && role && (
          <div className="wf-ne-field">
            <label className="wf-ne-label">Persona (from role)</label>
            <div className="wf-ne-persona-preview">{role.persona}</div>
          </div>
        )}

        {/* Task prompt / Command / Message */}
        <div className="wf-ne-field">
          <label className="wf-ne-label">
            {node.type === 'agent' ? 'Task Prompt' : node.type === 'shell' ? 'Command' : 'Message'}
          </label>
          <textarea
            className="wf-ne-textarea"
            value={node.prompt ?? node.command ?? node.message ?? ''}
            rows={5}
            onChange={(e) => {
              if (node.type === 'agent') update({ prompt: e.target.value })
              else if (node.type === 'shell') update({ command: e.target.value })
              else update({ message: e.target.value })
            }}
          />
        </div>

        {/* Output format preview (when role selected) */}
        {node.type === 'agent' && role?.outputFormat && (
          <div className="wf-ne-field">
            <label className="wf-ne-label">Output Format (from role)</label>
            <div className="wf-ne-persona-preview">{role.outputFormat}</div>
          </div>
        )}

        {/* Agent flags (agent nodes only) */}
        {node.type === 'agent' && (
          <div className="wf-ne-field">
            <label className="wf-ne-label">Agent Flags</label>
            <input
              className="wf-ne-input"
              value={node.agentFlags ?? ''}
              placeholder="Optional CLI flags"
              onChange={(e) => update({ agentFlags: e.target.value })}
            />
          </div>
        )}

        {/* Timeout (shell nodes only) */}
        {node.type === 'shell' && (
          <div className="wf-ne-field">
            <label className="wf-ne-label">Timeout (ms)</label>
            <input
              className="wf-ne-input"
              type="number"
              value={node.timeout ?? 60000}
              onChange={(e) => update({ timeout: parseInt(e.target.value, 10) || 60000 })}
            />
          </div>
        )}
      </div>
    </div>
  )
}
