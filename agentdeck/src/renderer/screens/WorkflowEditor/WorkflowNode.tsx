import { useState, useCallback, useRef, useEffect } from 'react'
import type {
  WorkflowNode as WorkflowNodeType,
  WorkflowNodeStatus,
  WorkflowNodeType as NodeType,
  AgentType,
} from '../../../shared/types'
import './WorkflowNode.css'

interface WorkflowNodeProps {
  node: WorkflowNodeType
  status: WorkflowNodeStatus
  selected: boolean
  connectTarget: boolean
  onSelect: (nodeId: string) => void
  onStartDrag: (e: React.MouseEvent, nodeId: string) => void
  onPortClick: (nodeId: string, port: 'in' | 'out') => void
  onUpdateNode: (node: WorkflowNodeType) => void
  onDeleteNode: (nodeId: string) => void
}

const KNOWN_AGENTS: AgentType[] = [
  'claude-code',
  'codex',
  'aider',
  'goose',
  'gemini-cli',
  'amazon-q',
  'opencode',
]

function getAgentBadgeClass(node: WorkflowNodeType): string {
  if (node.type === 'shell') return 'wf-badge-shell'
  if (node.type === 'checkpoint') return 'wf-badge-checkpoint'
  const agent = node.agent ?? 'claude-code'
  if (agent === 'codex') return 'wf-badge-codex'
  if (agent === 'aider') return 'wf-badge-aider'
  return 'wf-badge-claude'
}

function getAgentBadgeLabel(node: WorkflowNodeType): string {
  if (node.type === 'shell') return 'shell'
  if (node.type === 'checkpoint') return 'checkpoint'
  return node.agent ?? 'claude-code'
}

function getRoleText(node: WorkflowNodeType): string {
  if (node.type === 'agent') return node.prompt ?? ''
  if (node.type === 'shell') return node.command ?? ''
  return node.message ?? ''
}

function getRoleLabel(type: NodeType): string {
  if (type === 'agent') return 'Prompt'
  if (type === 'shell') return 'Command'
  return 'Message'
}

export function WorkflowNodeComponent({
  node,
  status,
  selected,
  connectTarget,
  onSelect,
  onStartDrag,
  onPortClick,
  onUpdateNode,
  onDeleteNode,
}: WorkflowNodeProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editName, setEditName] = useState(node.name)
  const [editRole, setEditRole] = useState(getRoleText(node))
  const [editAgent, setEditAgent] = useState<AgentType>(node.agent ?? 'claude-code')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Focus name input when entering edit mode
  useEffect(() => {
    if (editing && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [editing])

  const handleSave = useCallback(() => {
    const updated: WorkflowNodeType = { ...node, name: editName.trim() || node.name }
    if (node.type === 'agent') {
      updated.prompt = editRole
      updated.agent = editAgent
    } else if (node.type === 'shell') {
      updated.command = editRole
    } else {
      updated.message = editRole
    }
    onUpdateNode(updated)
    setEditing(false)
  }, [node, editName, editRole, editAgent, onUpdateNode])

  const handleCancel = useCallback(() => {
    setEditName(node.name)
    setEditRole(getRoleText(node))
    setEditAgent(node.agent ?? 'claude-code')
    setEditing(false)
  }, [node])

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        handleCancel()
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSave()
      }
    },
    [handleCancel, handleSave],
  )

  const enterEditMode = useCallback(() => {
    setEditName(node.name)
    setEditRole(getRoleText(node))
    setEditAgent(node.agent ?? 'claude-code')
    setEditing(true)
  }, [node])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      enterEditMode()
    },
    [enterEditMode],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      // Don't start drag from interactive elements
      if (
        target.closest('.wf-node-menu') ||
        target.closest('.wf-port') ||
        target.closest('.wf-node-edit-form') ||
        target.closest('.wf-node-dropdown')
      ) {
        return
      }
      onStartDrag(e, node.id)
    },
    [onStartDrag, node.id],
  )

  const handleNodeClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        target.closest('.wf-port') ||
        target.closest('.wf-node-menu') ||
        target.closest('.wf-node-edit-form') ||
        target.closest('.wf-node-dropdown')
      ) {
        return
      }
      onSelect(node.id)
    },
    [onSelect, node.id],
  )

  const handlePortClick = useCallback(
    (e: React.MouseEvent, port: 'in' | 'out') => {
      e.stopPropagation()
      onPortClick(node.id, port)
    },
    [onPortClick, node.id],
  )

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen((prev) => !prev)
  }, [])

  const handleMenuEdit = useCallback(() => {
    setMenuOpen(false)
    enterEditMode()
  }, [enterEditMode])

  const handleMenuDelete = useCallback(() => {
    setMenuOpen(false)
    onDeleteNode(node.id)
  }, [onDeleteNode, node.id])

  const className = [
    'wf-node',
    status,
    selected ? 'selected' : '',
    connectTarget ? 'connect-target' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      style={{ left: node.x, top: node.y }}
      onMouseDown={handleMouseDown}
      onClick={handleNodeClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Input port */}
      <div
        className="wf-port in"
        onClick={(e) => handlePortClick(e, 'in')}
        onMouseDown={(e) => e.stopPropagation()}
      />

      {/* Header */}
      <div className="wf-node-header">
        <div className="wf-node-status-dot" />
        <div className="wf-node-name">{node.name}</div>
        <button className="wf-node-menu" onClick={handleMenuClick}>
          {'\u22EF'}
        </button>
      </div>

      {/* Dropdown menu */}
      {menuOpen && (
        <div className="wf-node-dropdown" ref={menuRef}>
          <button className="wf-node-dropdown-item" onClick={handleMenuEdit}>
            Edit
          </button>
          <button className="wf-node-dropdown-item danger" onClick={handleMenuDelete}>
            Delete
          </button>
        </div>
      )}

      {/* Body */}
      <div className="wf-node-body">
        <div className="wf-node-role">{getRoleText(node)}</div>
        <div className="wf-node-footer">
          <span className={`wf-node-agent-badge ${getAgentBadgeClass(node)}`}>
            {getAgentBadgeLabel(node)}
          </span>
          <span className="wf-node-timing">{'\u2014'}</span>
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="wf-node-edit-form" onMouseDown={(e) => e.stopPropagation()}>
          <input
            ref={nameInputRef}
            className="wf-node-edit-input"
            type="text"
            value={editName}
            placeholder="Node name"
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleEditKeyDown}
          />
          <textarea
            className="wf-node-edit-textarea"
            value={editRole}
            placeholder={getRoleLabel(node.type)}
            onChange={(e) => setEditRole(e.target.value)}
            onKeyDown={handleEditKeyDown}
          />
          {node.type === 'agent' && (
            <select
              className="wf-node-edit-select"
              value={editAgent}
              onChange={(e) => setEditAgent(e.target.value as AgentType)}
            >
              {KNOWN_AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Output port */}
      <div
        className="wf-port out"
        onClick={(e) => handlePortClick(e, 'out')}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  )
}
