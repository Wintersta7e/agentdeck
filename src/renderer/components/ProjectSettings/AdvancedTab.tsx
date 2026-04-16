import { useState } from 'react'
import type { Project } from '../../../shared/types'

interface AdvancedTabProps {
  draft: Project
  onChange: (updates: Partial<Project>) => void
  onRemoveProject: () => void
}

export function AdvancedTab({
  draft,
  onChange,
  onRemoveProject,
}: AdvancedTabProps): React.JSX.Element {
  const [clearConfirm, setClearConfirm] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [removeMode, setRemoveMode] = useState(false)
  const [removeInput, setRemoveInput] = useState('')

  function handleClearHistory(): void {
    if (!clearConfirm) {
      setClearConfirm(true)
      return
    }
    // Clear history action (no-op for now, history is in PTY)
    setClearConfirm(false)
  }

  function handleResetDefaults(): void {
    if (!resetConfirm) {
      setResetConfirm(true)
      return
    }
    onChange({
      scrollbackLines: 5000,
      fontSize: 12,
      shell: '/bin/bash',
    })
    setResetConfirm(false)
  }

  function handleRemoveProject(): void {
    if (removeInput === draft.name) {
      onRemoveProject()
    }
  }

  return (
    <div className="settings-tab-panel">
      {/* Terminal Settings */}
      <div className="settings-section">
        <div className="section-head">
          <div className="section-head-title">Terminal Settings</div>
        </div>
        <div className="section-body">
          <div className="form-row">
            <div className="form-label-col">
              <div className="form-label">Scrollback buffer</div>
              <div className="form-sublabel">Number of lines to keep in history</div>
            </div>
            <div className="form-control-col">
              <input
                type="number"
                className="settings-input"
                value={draft.scrollbackLines ?? 5000}
                onChange={(e) => onChange({ scrollbackLines: Number(e.target.value) })}
                min={100}
                max={100000}
                aria-label="Scrollback buffer"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-label-col">
              <div className="form-label">Font size</div>
              <div className="form-sublabel">Terminal font size in pixels</div>
            </div>
            <div className="form-control-col">
              <input
                type="number"
                className="settings-input"
                value={draft.fontSize ?? 12}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
                min={8}
                max={24}
                aria-label="Font size"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-label-col">
              <div className="form-label">Shell path</div>
              <div className="form-sublabel">Default shell for the terminal</div>
            </div>
            <div className="form-control-col">
              <input
                type="text"
                className="settings-input"
                value={draft.shell ?? '/bin/bash'}
                onChange={(e) => onChange({ shell: e.target.value })}
                placeholder="/bin/bash"
                aria-label="Shell path"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="danger-section">
        <div className="danger-title">Danger Zone</div>

        <div className="danger-row">
          <div className="danger-row-info">
            <div className="danger-row-label">Clear history</div>
            <div className="danger-row-desc">Remove all session history for this project</div>
          </div>
          <button type="button" className="danger-btn" onClick={handleClearHistory}>
            {clearConfirm ? 'Confirm?' : 'Clear'}
          </button>
        </div>

        <div className="danger-row">
          <div className="danger-row-info">
            <div className="danger-row-label">Reset to defaults</div>
            <div className="danger-row-desc">
              Reset scrollback, font size, and shell to default values
            </div>
          </div>
          <button type="button" className="danger-btn" onClick={handleResetDefaults}>
            {resetConfirm ? 'Confirm?' : 'Reset'}
          </button>
        </div>

        <div className="danger-row">
          <div className="danger-row-info">
            <div className="danger-row-label">Remove project</div>
            <div className="danger-row-desc">
              Permanently remove this project from AgentDeck. This does not delete any files.
            </div>
          </div>
          {!removeMode ? (
            <button type="button" className="danger-btn" onClick={() => setRemoveMode(true)}>
              Remove
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                className="danger-confirm-input"
                value={removeInput}
                onChange={(e) => setRemoveInput(e.target.value)}
                placeholder={`Type "${draft.name}" to confirm`}
                aria-label="Type project name to confirm removal"
              />
              <button
                type="button"
                className="danger-btn"
                disabled={removeInput !== draft.name}
                onClick={handleRemoveProject}
                style={{
                  opacity: removeInput !== draft.name ? 0.5 : 1,
                  cursor: removeInput !== draft.name ? 'not-allowed' : 'pointer',
                }}
              >
                Confirm Remove
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
