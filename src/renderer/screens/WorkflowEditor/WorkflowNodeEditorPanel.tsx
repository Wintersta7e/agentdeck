import { useCallback, useEffect, useState } from 'react'
import type { WorkflowNode, WorkflowNodeStatus, AgentType } from '../../../shared/types'
import { AGENTS } from '../../../shared/agents'
import { useAppStore } from '../../store/appStore'
import { useRolesMap } from '../../hooks/useRolesMap'
import { useProjects } from '../../hooks/useProjects'
import RoleInlineForm from './RoleInlineForm'
import './WorkflowNodeEditorPanel.css'

interface Props {
  node: WorkflowNode
  nodeStatuses: Record<string, WorkflowNodeStatus>
  onUpdateNode: (node: WorkflowNode) => void
  onClose: () => void
}

const KNOWN_AGENTS: AgentType[] = AGENTS.map((a) => a.id)
const NEW_ROLE_SENTINEL = '__new__'

export default function WorkflowNodeEditorPanel({
  node,
  nodeStatuses,
  onUpdateNode,
  onClose,
}: Props): React.JSX.Element {
  const roles = useAppStore((s) => s.roles)
  const rolesMap = useRolesMap()
  const { addRole, updateRole, deleteRole } = useProjects()
  const role = node.roleId ? rolesMap.get(node.roleId) : undefined

  const [roleFormMode, setRoleFormMode] = useState<'edit' | 'create' | null>(null)

  // H7: Auto-clear orphan roleId when role has been deleted
  useEffect(() => {
    if (!node.roleId) return
    if (!rolesMap.has(node.roleId)) {
      onUpdateNode({ ...node, roleId: undefined })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when roleId or available roles change, not on every node object change
  }, [node.roleId, rolesMap, onUpdateNode])

  const update = useCallback(
    (patch: Partial<WorkflowNode>) => {
      onUpdateNode({ ...node, ...patch })
    },
    [node, onUpdateNode],
  )

  const handleRoleDropdownChange = useCallback(
    (value: string) => {
      if (value === NEW_ROLE_SENTINEL) {
        setRoleFormMode('create')
        return
      }
      update({ roleId: value || undefined })
      setRoleFormMode(null)
    },
    [update],
  )

  const handleEditClick = useCallback(() => {
    setRoleFormMode((prev) => (prev === 'edit' ? null : 'edit'))
  }, [])

  const handleRoleSave = useCallback(
    async (draft: { icon: string; name: string; persona: string; outputFormat: string }) => {
      const outputFormat = draft.outputFormat.trim() || undefined
      if (roleFormMode === 'create') {
        const saved = await addRole({
          name: draft.name.trim(),
          icon: draft.icon,
          persona: draft.persona.trim(),
          outputFormat,
          builtin: false,
        })
        update({ roleId: saved.id })
      } else if (role) {
        await updateRole({
          ...role,
          name: draft.name.trim(),
          icon: draft.icon,
          persona: draft.persona.trim(),
          outputFormat,
        })
      }
      setRoleFormMode(null)
    },
    [roleFormMode, role, addRole, updateRole, update],
  )

  const handleRoleDelete = useCallback(async () => {
    if (!role || role.builtin) return
    await deleteRole(role.id)
    update({ roleId: undefined })
    setRoleFormMode(null)
  }, [role, deleteRole, update])

  const handleRoleDuplicate = useCallback(async () => {
    if (!role) return
    const saved = await addRole({
      name: `${role.name} (copy)`,
      icon: role.icon,
      persona: role.persona,
      outputFormat: role.outputFormat,
      builtin: false,
    })
    update({ roleId: saved.id })
    setRoleFormMode('edit')
  }, [role, addRole, update])

  const handleRoleCancel = useCallback(() => {
    setRoleFormMode(null)
  }, [])

  const showRolePreviews = node.type === 'agent' && role && roleFormMode === null

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

        {/* Role dropdown + Edit/New buttons (agent nodes only) */}
        {node.type === 'agent' && (
          <div className="wf-ne-field wf-ne-field-role">
            <label className="wf-ne-label">Role</label>
            <div className="wf-ne-role-row">
              <select
                className="wf-ne-select wf-ne-role-select"
                value={roleFormMode === 'create' ? NEW_ROLE_SENTINEL : (node.roleId ?? '')}
                onChange={(e) => handleRoleDropdownChange(e.target.value)}
              >
                <option value="">No role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.icon} {r.name}
                  </option>
                ))}
                <option disabled>{'\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'}</option>
                <option value={NEW_ROLE_SENTINEL}>+ New Role</option>
              </select>
              {role && roleFormMode !== 'create' && (
                <button
                  className={`wf-ne-role-edit-btn${roleFormMode === 'edit' ? ' active' : ''}`}
                  onClick={handleEditClick}
                  type="button"
                >
                  {roleFormMode === 'edit' ? 'Editing' : 'Edit'}
                </button>
              )}
              {roleFormMode === 'create' && (
                <button className="wf-ne-role-edit-btn new" type="button" disabled>
                  + New
                </button>
              )}
            </div>

            {/* Inline role form */}
            {roleFormMode !== null && (
              <RoleInlineForm
                key={roleFormMode === 'edit' ? role?.id : 'new'}
                role={roleFormMode === 'edit' ? role : undefined}
                mode={roleFormMode}
                onSave={(d) => void handleRoleSave(d)}
                onDelete={() => void handleRoleDelete()}
                onDuplicate={() => void handleRoleDuplicate()}
                onCancel={handleRoleCancel}
              />
            )}
          </div>
        )}

        {/* Persona preview (when role selected and form closed) */}
        {showRolePreviews && (
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

        {/* Output format preview (when role selected and form closed) */}
        {showRolePreviews && role.outputFormat && (
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

        {/* Timeout (shell + agent nodes) */}
        {(node.type === 'shell' || node.type === 'agent') && (
          <div className="wf-ne-field">
            <label className="wf-ne-label">
              {node.type === 'agent' ? 'Absolute Timeout (ms, optional)' : 'Timeout (ms)'}
            </label>
            <input
              className="wf-ne-input"
              type="number"
              min={0}
              placeholder={node.type === 'agent' ? 'Idle timeout only (2 min silence)' : '60000'}
              value={node.timeout ?? (node.type === 'shell' ? 60000 : '')}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (node.type === 'agent') {
                  // Agent: 0 or empty = no absolute timeout (idle timeout handles stuck agents)
                  update({ timeout: val > 0 ? val : undefined })
                } else {
                  update({ timeout: val > 0 ? val : 60000 })
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
