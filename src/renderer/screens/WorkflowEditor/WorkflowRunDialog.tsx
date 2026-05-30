import { useState, useEffect, useCallback } from 'react'
import type { WorkflowVariable } from '../../../shared/types'
import { FolderOpen } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { windowsToWsl } from '../../utils/path-conversion'
import './WorkflowRunDialog.css'

interface WorkflowRunDialogProps {
  variables: WorkflowVariable[]
  /** WSL path of the project selected for this run, used to prefill path vars. */
  projectPath?: string | undefined
  onStart: (values: Record<string, string>) => void
  onCancel: () => void
}

export function buildDefaults(
  variables: WorkflowVariable[],
  projectPath?: string,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const v of variables) {
    // Prefill path variables that have no explicit default with the selected
    // project's path, so the run dialog doesn't ask for a directory the user
    // already chose in the run overview. An explicit default always wins.
    if ((v.default === undefined || v.default === '') && v.type === 'path' && projectPath) {
      result[v.name] = projectPath
    } else {
      result[v.name] = v.default ?? ''
    }
  }
  return result
}

function isRequired(v: WorkflowVariable): boolean {
  return v.required !== false
}

export default function WorkflowRunDialog({
  variables,
  projectPath,
  onStart,
  onCancel,
}: WorkflowRunDialogProps): React.JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(() =>
    buildDefaults(variables, projectPath),
  )
  const [submitted, setSubmitted] = useState(false)
  const trapRef = useFocusTrap<HTMLDivElement>()

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
      if (e.target === e.currentTarget) {
        onCancel()
      }
    },
    [onCancel],
  )

  const handleBrowse = useCallback(
    async (name: string) => {
      const result = await window.agentDeck.pickFolder()
      if (result !== null) {
        setValue(name, windowsToWsl(result))
      }
    },
    [setValue],
  )

  const canStart = variables.every((v) => !isRequired(v) || values[v.name]?.trim())

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitted(true)
      if (canStart) {
        onStart(values)
      }
    },
    [canStart, onStart, values],
  )

  return (
    <div
      className="wf-run-dialog-backdrop"
      ref={trapRef}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wf-run-dialog-heading"
    >
      <form className="wf-run-dialog" onSubmit={handleSubmit}>
        <div className="wf-run-dialog-header">
          <h3 id="wf-run-dialog-heading" className="wf-run-dialog-title">
            Configure Variables
          </h3>
        </div>

        <div className="wf-run-dialog-body">
          {variables.map((v) => (
            <VariableField
              key={v.name}
              variable={v}
              value={values[v.name] ?? ''}
              onChange={setValue}
              onBrowse={handleBrowse}
              showErrors={submitted}
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
  showErrors: boolean
}

function VariableField({
  variable,
  value,
  onChange,
  onBrowse,
  showErrors,
}: VariableFieldProps): React.JSX.Element {
  const label = variable.label ?? variable.name
  const required = isRequired(variable)
  const hasError = showErrors && required && !value.trim()

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
    <div className={`wf-run-field${hasError ? ' wf-run-field--error' : ''}`}>
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
      {hasError && <span className="wf-run-field-error">Required</span>}
    </div>
  )
}
