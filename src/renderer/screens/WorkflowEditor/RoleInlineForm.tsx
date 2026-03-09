import { useState } from 'react'
import type { Role } from '../../../shared/types'

interface RoleDraft {
  icon: string
  name: string
  persona: string
  outputFormat: string
}

interface Props {
  /** The role being edited, or undefined when creating a new role */
  role: Role | undefined
  /** 'edit' for existing roles, 'create' for new ones */
  mode: 'edit' | 'create'
  onSave: (draft: RoleDraft) => void
  onDelete: () => void
  onDuplicate: () => void
  onCancel: () => void
}

function draftFromRole(role: Role | undefined): RoleDraft {
  return {
    icon: role?.icon ?? '\u2728',
    name: role?.name ?? '',
    persona: role?.persona ?? '',
    outputFormat: role?.outputFormat ?? '',
  }
}

export default function RoleInlineForm({
  role,
  mode,
  onSave,
  onDelete,
  onDuplicate,
  onCancel,
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState<RoleDraft>(() => draftFromRole(role))
  const isBuiltin = mode === 'edit' && role?.builtin === true
  const isDisabled = isBuiltin
  const canSave = draft.name.trim().length > 0 && draft.persona.trim().length > 0

  const patch = (field: keyof RoleDraft, value: string): void => {
    setDraft((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className={`wf-ne-role-form${mode === 'create' ? ' creating' : ''}`}>
      <div className="wf-ne-role-form-header">
        <span className="wf-ne-role-form-title">
          {mode === 'create' ? 'New Role' : 'Edit Role'}
        </span>
        <span className={`wf-ne-role-form-badge ${isBuiltin ? 'builtin' : 'custom'}`}>
          {isBuiltin ? 'BUILT-IN' : 'CUSTOM'}
        </span>
      </div>

      {isBuiltin && (
        <div className="wf-ne-builtin-notice">
          <span>{'\uD83D\uDD12'}</span>
          Built-in roles are read-only.{' '}
          <button className="wf-ne-dup-link" onClick={onDuplicate} type="button">
            Duplicate as custom role
          </button>
        </div>
      )}

      <div className="wf-ne-field">
        <label className="wf-ne-label">Icon &amp; Name</label>
        <div className="wf-ne-role-icon-name">
          <input
            className="wf-ne-role-icon-input"
            value={draft.icon}
            disabled={isDisabled}
            maxLength={4}
            onChange={(e) => patch('icon', e.target.value)}
          />
          <input
            className="wf-ne-role-name-input"
            value={draft.name}
            disabled={isDisabled}
            maxLength={100}
            placeholder="Role name..."
            onChange={(e) => patch('name', e.target.value)}
          />
        </div>
      </div>

      <div className="wf-ne-field">
        <label className="wf-ne-label">Persona</label>
        <textarea
          className="wf-ne-textarea"
          value={draft.persona}
          disabled={isDisabled}
          rows={3}
          placeholder="Describe the role's expertise, focus areas, and style..."
          onChange={(e) => patch('persona', e.target.value)}
        />
      </div>

      <div className="wf-ne-field">
        <label className="wf-ne-label">Output Format (optional)</label>
        <textarea
          className="wf-ne-textarea"
          value={draft.outputFormat}
          disabled={isDisabled}
          rows={3}
          placeholder="Markdown template for structured output..."
          onChange={(e) => patch('outputFormat', e.target.value)}
        />
      </div>

      <div className="wf-ne-role-form-actions">
        {!isBuiltin && (
          <button
            className="wf-ne-btn wf-ne-btn-save"
            disabled={!canSave}
            onClick={() => onSave(draft)}
            type="button"
          >
            {mode === 'create' ? 'Create' : 'Save'}
          </button>
        )}
        <button className="wf-ne-btn wf-ne-btn-cancel" onClick={onCancel} type="button">
          {isBuiltin ? 'Close' : 'Cancel'}
        </button>
        {mode === 'edit' && (
          <button
            className="wf-ne-btn wf-ne-btn-delete"
            disabled={isBuiltin}
            onClick={onDelete}
            type="button"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
