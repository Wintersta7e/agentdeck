import { useRef, useEffect } from 'react'
import type { WorkflowNodeType } from '../../../shared/types'
import './AddNodeMenu.css'

interface AddNodeMenuProps {
  open: boolean
  onAdd: (type: WorkflowNodeType) => void
  onClose: () => void
}

interface NodeOption {
  type: WorkflowNodeType
  icon: string
  label: string
  description: string
  colorClass: string
}

const NODE_OPTIONS: NodeOption[] = [
  {
    type: 'agent',
    icon: '\u2B21', // ⬡
    label: 'Agent',
    description: 'Runs an AI agent (claude-code, codex, etc.)',
    colorClass: 'wf-add-icon-agent',
  },
  {
    type: 'shell',
    icon: '$',
    label: 'Shell',
    description: 'Executes a bash command in WSL',
    colorClass: 'wf-add-icon-shell',
  },
  {
    type: 'checkpoint',
    icon: '\u23F8', // ⏸
    label: 'Checkpoint',
    description: 'Pauses workflow for user confirmation',
    colorClass: 'wf-add-icon-checkpoint',
  },
]

export default function AddNodeMenu({ open, onAdd, onClose }: AddNodeMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return

    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="wf-add-menu" ref={menuRef}>
      {NODE_OPTIONS.map((opt) => (
        <div
          key={opt.type}
          className="wf-add-menu-item"
          onClick={() => {
            onAdd(opt.type)
            onClose()
          }}
        >
          <div className={`wf-add-menu-icon ${opt.colorClass}`}>{opt.icon}</div>
          <div className="wf-add-menu-text">
            <div className="wf-add-menu-name">{opt.label}</div>
            <div className="wf-add-menu-desc">{opt.description}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
