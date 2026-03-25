import { useState, useEffect, useCallback, useRef } from 'react'
import type { WorkflowVariable } from '../../../shared/types'
import { FolderOpen } from 'lucide-react'
import './WorkflowRunDialog.css'

interface WorkflowRunDialogProps {
  variables: WorkflowVariable[]
  onStart: (values: Record<string, string>) => void
  onCancel: () => void
}

function buildDefaults(variables: WorkflowVariable[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const v of variables) {
    result[v.name] = v.default ?? ''
  }
  return result
}

function isRequired(v: WorkflowVariable): boolean {
  return v.required !== false
}

export default function WorkflowRunDialog({
  variables,
  onStart,
  onCancel,
}: WorkflowRunDialogProps): React.JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(() => buildDefaults(variables))
  const backdropRef = useRef<HTMLDivElement>(null)

  const setValue = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
  }, [])

  // Escape key closes dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onCancel])

  // Click on backdrop closes dialog
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) {
        onCancel()
      }
    },
    [onCancel],
  )

  const handleBrowse = useCallback(
    async (name: string) => {
      const result = await window.agentDeck.pickFolder()
      if (result !== null) {
        setValue(name, result)
      }
    },
    [setValue],
  )

  const canStart = variables.every((v) => !isRequired(v) || values[v.name]?.trim())

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (canStart) {
        onStart(values)
      }
    },
    [canStart, onStart, values],
  )

  return (
    <div className="wf-run-dialog-backdrop" ref={backdropRef} onClick={handleBackdropClick}>
      <form className="wf-run-dialog" onSubmit={handleSubmit}>
        <div className="wf-run-dialog-header">
          <h3 className="wf-run-dialog-title">Configure Variables</h3>
        </div>

        <div className="wf-run-dialog-body">
          {variables.map((v) => (
            <VariableField
              key={v.name}
              variable={v}
              value={values[v.name] ?? ''}
              onChange={setValue}
              onBrowse={handleBrowse}
            />
          ))}
        </div>

        <div className="wf-run-actions">
          <button type="button" className="wf-run-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="wf-run-btn-start" disabled={!canStart}>
            Start
          </button>
        </div>
      </form>
    </div>
  )
}

interface VariableFieldProps {
  variable: WorkflowVariable
  value: string
  onChange: (name: string, value: string) => void
  onBrowse: (name: string) => Promise<void>
}

function VariableField({
  variable,
  value,
  onChange,
  onBrowse,
}: VariableFieldProps): React.JSX.Element {
  const label = variable.label ?? variable.name
  const required = isRequired(variable)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      onChange(variable.name, e.target.value)
    },
    [onChange, variable.name],
  )

  const handleBrowseClick = useCallback(() => {
    void onBrowse(variable.name)
  }, [onBrowse, variable.name])

  return (
    <div className="wf-run-field">
      <label>
        {label}
        {required && <span className="wf-run-field-required">*</span>}
      </label>

      {variable.type === 'string' && (
        <input type="text" value={value} onChange={handleChange} placeholder={variable.name} />
      )}

      {variable.type === 'text' && (
        <textarea rows={4} value={value} onChange={handleChange} placeholder={variable.name} />
      )}

      {variable.type === 'path' && (
        <div className="wf-run-path-row">
          <input type="text" value={value} onChange={handleChange} placeholder="/path/to/..." />
          <button type="button" className="wf-run-path-btn" onClick={handleBrowseClick}>
            <FolderOpen size={13} /> Browse
          </button>
        </div>
      )}

      {variable.type === 'choice' && (
        <select value={value} onChange={handleChange}>
          <option value="">Select...</option>
          {variable.choices?.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
