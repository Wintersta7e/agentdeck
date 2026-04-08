import { useState, useCallback, useRef, useEffect } from 'react'
import { Download, Upload, Copy } from 'lucide-react'
import type { WorkflowNodeType, WorkflowStatus, Project } from '../../../shared/types'
import AddNodeMenu from './AddNodeMenu'

interface WorkflowToolbarProps {
  workflowName: string | undefined
  onNameChange: (name: string) => void
  onAddNode: (type: WorkflowNodeType) => void
  addMenuOpen: boolean
  onToggleAddMenu: () => void
  onCloseAddMenu: () => void
  onExport: () => void
  onImport: () => void
  onDuplicate: () => void
  onRun: () => void
  onStop: () => void
  workflowStatus: WorkflowStatus
  projectId: string | undefined
  onProjectChange: (projectId: string | undefined) => void
  projects: Project[]
}

export default function WorkflowToolbar({
  workflowName,
  onNameChange,
  onAddNode,
  addMenuOpen,
  onToggleAddMenu,
  onCloseAddMenu,
  onExport,
  onImport,
  onDuplicate,
  onRun,
  onStop,
  workflowStatus,
  projectId,
  onProjectChange,
  projects,
}: WorkflowToolbarProps): React.JSX.Element {
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
    }
  }, [])

  const displayName = workflowName ?? 'Workflow'

  const startEditingName = useCallback(() => {
    setEditName(displayName)
    setIsEditingName(true)
    // Focus input on next tick after render
    focusTimerRef.current = setTimeout(() => nameInputRef.current?.select(), 0)
  }, [displayName])

  const commitName = useCallback(() => {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === displayName) {
      setIsEditingName(false)
      return
    }
    onNameChange(trimmed)
    setIsEditingName(false)
  }, [editName, displayName, onNameChange])

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitName()
      } else if (e.key === 'Escape') {
        setIsEditingName(false)
      }
    },
    [commitName],
  )

  const handleProjectSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onProjectChange(e.target.value || undefined)
    },
    [onProjectChange],
  )

  const statusText: Record<WorkflowStatus, string> = {
    idle: 'Ready',
    running: 'Running\u2026',
    done: 'Complete',
    error: 'Error',
    stopped: 'Stopped',
  }

  return (
    <div className="wf-toolbar">
      {isEditingName ? (
        <input
          ref={nameInputRef}
          className="wf-name-input"
          aria-label="Workflow name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitName}
          onKeyDown={handleNameKeyDown}
          maxLength={60}
        />
      ) : (
        <span className="wf-name" onDoubleClick={startEditingName} title="Double-click to rename">
          {displayName}
        </span>
      )}
      <span className="wf-name-badge">workflow</span>
      <div className="wf-sep" />
      <button
        className={`wf-btn play${workflowStatus === 'running' ? ' running' : ''}`}
        onClick={workflowStatus === 'running' ? onStop : onRun}
        type="button"
      >
        <span className="wf-btn-icon">{workflowStatus === 'running' ? '\u25A0' : '\u25B6'}</span>
        {workflowStatus === 'running' ? 'Stop' : 'Run Workflow'}
      </button>
      <div style={{ position: 'relative' }}>
        <button className="wf-btn add-node" onClick={onToggleAddMenu} type="button">
          <span className="wf-btn-icon">{'\u2295'}</span> Add Node
        </button>
        <AddNodeMenu open={addMenuOpen} onAdd={onAddNode} onClose={onCloseAddMenu} />
      </div>
      <div className="wf-sep" />
      <button className="wf-toolbar-btn" onClick={onExport} title="Export workflow" type="button">
        <Download size={14} /> Export
      </button>
      <button className="wf-toolbar-btn" onClick={onImport} title="Import workflow" type="button">
        <Upload size={14} /> Import
      </button>
      <button
        className="wf-toolbar-btn"
        onClick={onDuplicate}
        title="Duplicate workflow"
        type="button"
      >
        <Copy size={14} /> Duplicate
      </button>
      <div className="wf-sep" />
      <select className="wf-project-select" value={projectId ?? ''} onChange={handleProjectSelect}>
        <option value="">No project (cwd)</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="wf-spacer" />
      <div className="wf-status">
        <div className={`wf-status-dot ${workflowStatus}`} />
        <span>{statusText[workflowStatus]}</span>
      </div>
    </div>
  )
}
