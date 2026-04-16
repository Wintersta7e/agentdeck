import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import type { WorkflowMeta } from '../../../shared/types'
import { useAppStore } from '../../store/appStore'
import type { ConfirmRequest } from './ProjectSection'

// ---------- Props ----------
export interface WorkflowSectionProps {
  workflows: WorkflowMeta[]
  expanded: boolean
  activeWorkflowId: string | null
  onToggle: () => void
  onCreateWorkflow: () => void
  onOpenWorkflow: (id: string) => void
  setWorkflows: (w: WorkflowMeta[]) => void
  openWorkflowIds: string[]
  closeWorkflow: (id: string) => void
  requestConfirm: (req: ConfirmRequest) => void
}

export function WorkflowSection({
  workflows,
  expanded,
  activeWorkflowId,
  onToggle,
  onCreateWorkflow,
  onOpenWorkflow,
  setWorkflows,
  openWorkflowIds,
  closeWorkflow,
  requestConfirm,
}: WorkflowSectionProps): React.JSX.Element {
  // ---------- Context menu ----------
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    workflowId: string
  } | null>(null)

  const closeMenu = useCallback(() => setContextMenu(null), [])

  function handleContextMenu(e: React.MouseEvent, workflowId: string): void {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, workflowId })
  }

  // ---------- Inline rename ----------
  const [renamingWorkflowId, setRenamingWorkflowId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
    },
    [],
  )

  function handleRenameWorkflow(): void {
    if (!contextMenu) return
    const wf = workflows.find((w) => w.id === contextMenu.workflowId)
    if (!wf) return
    setRenamingWorkflowId(wf.id)
    setRenameValue(wf.name)
    closeMenu()
    focusTimerRef.current = setTimeout(() => renameInputRef.current?.select(), 0)
  }

  function commitRename(): void {
    if (!renamingWorkflowId) return
    const trimmed = renameValue.trim()
    const current = useAppStore.getState().workflows
    const wf = current.find((w) => w.id === renamingWorkflowId)
    if (!trimmed || !wf || trimmed === wf.name) {
      setRenamingWorkflowId(null)
      return
    }
    // BUG-9: Persist to disk, revert optimistic update on failure
    const oldName = wf.name
    const renameId = renamingWorkflowId
    window.agentDeck.workflows.rename(renameId, trimmed).catch((err: unknown) => {
      window.agentDeck.log.send('error', 'sidebar', 'Failed to rename workflow', {
        err: String(err),
      })
      const latest = useAppStore.getState().workflows
      setWorkflows(latest.map((w) => (w.id === renameId ? { ...w, name: oldName } : w)))
      useAppStore.getState().updateWorkflowMeta(renameId, { name: oldName })
    })
    // Optimistic update
    setWorkflows(current.map((w) => (w.id === renamingWorkflowId ? { ...w, name: trimmed } : w)))
    useAppStore.getState().updateWorkflowMeta(renamingWorkflowId, { name: trimmed })
    setRenamingWorkflowId(null)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur() // triggers onBlur → commitRename
      return
    } else if (e.key === 'Escape') {
      setRenamingWorkflowId(null)
    }
  }

  // ---------- Delete ----------
  function handleDeleteWorkflow(): void {
    if (!contextMenu) return
    const wf = workflows.find((w) => w.id === contextMenu.workflowId)
    const workflowName = wf?.name ?? 'this workflow'
    const id = contextMenu.workflowId
    closeMenu()
    requestConfirm({
      title: 'Delete Workflow',
      message: `Delete "${workflowName}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        if (openWorkflowIds.includes(id)) closeWorkflow(id)
        window.agentDeck.workflows
          .delete(id)
          .then(() => {
            const current = useAppStore.getState().workflows
            setWorkflows(current.filter((w) => w.id !== id))
          })
          .catch((err: unknown) => {
            window.agentDeck.log.send('error', 'sidebar', 'Failed to delete workflow', {
              err: String(err),
            })
            useAppStore.getState().addNotification('error', 'Failed to delete workflow')
          })
      },
    })
  }

  return (
    <>
      <div className="sidebar-section">
        <div
          className="sidebar-label sidebar-label-clickable"
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onToggle()
            }
          }}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
        >
          <span>
            <span className={`sidebar-chevron${expanded ? ' open' : ''}`}>
              <ChevronRight size={10} />
            </span>
            Workflows
          </span>
          <button
            className="sidebar-action"
            aria-label="New workflow"
            onClick={(e) => {
              e.stopPropagation()
              onCreateWorkflow()
            }}
          >
            <Plus size={14} />
          </button>
        </div>
        {expanded && (
          <div role="group" aria-label="Workflows">
            {workflows.length === 0 && (
              <div className="sidebar-empty-hint">Create workflows from the + button</div>
            )}
            {workflows.map((w) => (
              <div
                key={w.id}
                className={`sidebar-item${activeWorkflowId === w.id ? ' sidebar-item-wf-active' : ''}`}
                onClick={() => onOpenWorkflow(w.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenWorkflow(w.id)
                  }
                }}
                role="button"
                tabIndex={0}
                onContextMenu={(e) => handleContextMenu(e, w.id)}
              >
                <div className="sidebar-dot sidebar-dot-wf" />
                <div className="sidebar-item-info">
                  {renamingWorkflowId === w.id ? (
                    <input
                      ref={renameInputRef}
                      className="sidebar-rename-input"
                      aria-label="Rename workflow"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={handleRenameKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      maxLength={60}
                    />
                  ) : (
                    <div
                      className="sidebar-item-name"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setRenamingWorkflowId(w.id)
                        setRenameValue(w.name)
                        focusTimerRef.current = setTimeout(
                          () => renameInputRef.current?.select(),
                          0,
                        )
                      }}
                    >
                      {w.name}
                    </div>
                  )}
                  <div className="sidebar-item-sub">{w.nodeCount} nodes</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Workflow context menu */}
      {contextMenu && (
        <div
          className="sidebar-context-menu"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 200),
            left: Math.min(contextMenu.x, window.innerWidth - 160),
          }}
        >
          <button className="sidebar-context-item" onClick={handleRenameWorkflow}>
            Rename workflow
          </button>
          <div className="sidebar-context-divider" />
          <button className="sidebar-context-item danger" onClick={handleDeleteWorkflow}>
            Delete workflow
          </button>
        </div>
      )}
    </>
  )
}
