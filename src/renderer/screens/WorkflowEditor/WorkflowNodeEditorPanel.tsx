import { useCallback, useEffect, useState } from 'react'
import type { WorkflowNode, WorkflowNodeStatus, AgentType, SkillInfo } from '../../../shared/types'
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
  const [skills, setSkills] = useState<SkillInfo[]>([])

  // Fetch available skills when agent is codex
  useEffect(() => {
    if (node.type !== 'agent' || node.agent !== 'codex') {
      setSkills([])
      return
    }
    let cancelled = false
    void window.agentDeck.skills
      .list({ includeGlobal: true })
      .then((result) => {
        if (!cancelled) setSkills(result)
      })
      .catch(() => {
        if (!cancelled) setSkills([])
      })
    return () => {
      cancelled = true
    }
  }, [node.type, node.agent])

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
              onChange={(e) => {
                const newAgent = e.target.value as AgentType
                const patch: Partial<typeof node> = { agent: newAgent }
                if (newAgent !== 'codex' && node.skillId) {
                  patch.skillId = undefined
                }
                update(patch)
              }}
            >
              {KNOWN_AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Skill dropdown (codex agent nodes only) */}
        {node.type === 'agent' && node.agent === 'codex' && (
          <div className="wf-ne-field">
            <label className="wf-ne-label">Skill</label>
            {node.skillId && (
              <div className="wf-ne-skill-chip">
                <span className="wf-ne-skill-chip-text">#{node.skillId.split(':').pop()}</span>
                <button
                  className="wf-ne-skill-chip-clear"
                  type="button"
                  onClick={() => update({ skillId: undefined })}
                  title="Remove skill"
                >
                  {'\u00D7'}
                </button>
              </div>
            )}
            <select
              className="wf-ne-select"
              value={node.skillId ?? ''}
              onChange={(e) => update({ skillId: e.target.value || undefined })}
            >
              <option value="">None</option>
              {(() => {
                const projectSkills = skills.filter((s) => s.scope === 'project')
                const globalSkills = skills.filter((s) => s.scope === 'global')
                return (
                  <>
                    {projectSkills.length > 0 && (
                      <optgroup label="Project Skills">
                        {projectSkills.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} — {s.description.slice(0, 60)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {globalSkills.length > 0 && (
                      <optgroup label="Global Skills">
                        {globalSkills.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} — {s.description.slice(0, 60)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
                )
              })()}
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

        {/* Task prompt / Command / Message (not shown for condition nodes) */}
        {node.type !== 'condition' && (
          <div className="wf-ne-field">
            <label className="wf-ne-label">
              {node.type === 'agent'
                ? 'Task Prompt'
                : node.type === 'shell'
                  ? 'Command'
                  : 'Message'}
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
        )}

        {/* Condition-specific fields */}
        {node.type === 'condition' && (
          <>
            <div className="wf-ne-field">
              <label className="wf-ne-label">Condition Mode</label>
              <select
                className="wf-ne-select"
                value={node.conditionMode ?? 'exitCode'}
                onChange={(e) =>
                  update({ conditionMode: e.target.value as 'exitCode' | 'outputMatch' })
                }
              >
                <option value="exitCode">Exit Code (0 = true)</option>
                <option value="outputMatch">Output Match (regex)</option>
              </select>
            </div>
            {(node.conditionMode ?? 'exitCode') === 'outputMatch' && (
              <div className="wf-ne-field">
                <label className="wf-ne-label">Regex Pattern</label>
                <input
                  type="text"
                  className="wf-ne-input"
                  value={node.conditionPattern ?? ''}
                  onChange={(e) => update({ conditionPattern: e.target.value })}
                  placeholder="e.g. PASS|SUCCESS|No errors"
                />
              </div>
            )}
          </>
        )}

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

        {/* Timeout (shell + agent nodes) — stored as ms, displayed as minutes */}
        {(node.type === 'shell' || node.type === 'agent') && (
          <div className="wf-ne-field">
            <label className="wf-ne-label">
              {node.type === 'agent' ? 'Absolute Timeout (min, optional)' : 'Timeout (min)'}
            </label>
            <input
              className="wf-ne-input"
              type="number"
              min={0}
              step={1}
              placeholder={node.type === 'agent' ? 'Idle timeout only (5 min silence)' : '1'}
              value={
                node.timeout ? Math.round(node.timeout / 60_000) : node.type === 'shell' ? 1 : ''
              }
              onChange={(e) => {
                const minutes = parseFloat(e.target.value)
                const ms = Math.round(minutes * 60_000)
                if (node.type === 'agent') {
                  update({ timeout: ms > 0 ? ms : undefined })
                } else {
                  update({ timeout: ms > 0 ? ms : 60_000 })
                }
              }}
            />
          </div>
        )}

        {/* Retry config (agent + shell nodes only) */}
        {(node.type === 'agent' || node.type === 'shell') && (
          <details className="wf-ne-details">
            <summary className="wf-ne-summary">Retry on Failure</summary>
            <div className="wf-ne-field">
              <label className="wf-ne-label">Retry Count (0 = no retry)</label>
              <input
                type="number"
                className="wf-ne-input"
                min={0}
                max={5}
                value={node.retryCount ?? 0}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  update({ retryCount: v > 0 ? v : undefined })
                }}
              />
            </div>
            {(node.retryCount ?? 0) > 0 && (
              <div className="wf-ne-field">
                <label className="wf-ne-label">Retry Delay (ms)</label>
                <input
                  type="number"
                  className="wf-ne-input"
                  min={100}
                  max={60000}
                  step={100}
                  value={node.retryDelayMs ?? 2000}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    update({
                      retryDelayMs: isNaN(v) ? undefined : Math.max(100, Math.min(60000, v)),
                    })
                  }}
                />
              </div>
            )}
          </details>
        )}
      </div>
    </div>
  )
}
