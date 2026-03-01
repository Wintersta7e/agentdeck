import { useState, useCallback, useRef, useEffect, memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type {
  WorkflowNode as WorkflowNodeType,
  WorkflowNodeStatus,
  WorkflowNodeType as NodeType,
  AgentType,
} from '../../../shared/types'
import './WorkflowNode.css'

export interface WorkflowNodeData {
  node: WorkflowNodeType
  status: WorkflowNodeStatus
  onUpdateNode: (node: WorkflowNodeType) => void
  onDeleteNode: (nodeId: string) => void
  [key: string]: unknown
}

export type WfNode = Node<WorkflowNodeData, 'workflowNode'>

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

function WorkflowNodeInner({ data, selected }: NodeProps<WfNode>): React.JSX.Element {
  const { node, status, onUpdateNode, onDeleteNode } = data

  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editName, setEditName] = useState(node.name)
  const [editRole, setEditRole] = useState(getRoleText(node))
  const [editAgent, setEditAgent] = useState<AgentType>(node.agent ?? 'claude-code')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

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

  const className = ['wf-node-inner', status, selected ? 'selected' : ''].filter(Boolean).join(' ')

  return (
    <div className={className} onDoubleClick={handleDoubleClick}>
      <Handle type="target" position={Position.Left} className="wf-handle" />

      <div className="wf-node-header">
        <div className="wf-node-status-dot" />
        <div className="wf-node-name">{node.name}</div>
        <button className="wf-node-menu nodrag" onClick={handleMenuClick} type="button">
          {'\u22EF'}
        </button>
      </div>

      {menuOpen && (
        <div className="wf-node-dropdown" ref={menuRef}>
          <button className="wf-node-dropdown-item nodrag" onClick={handleMenuEdit} type="button">
            Edit
          </button>
          <button
            className="wf-node-dropdown-item danger nodrag"
            onClick={handleMenuDelete}
            type="button"
          >
            Delete
          </button>
        </div>
      )}

      <div className="wf-node-body">
        <div className="wf-node-role">{getRoleText(node)}</div>
        <div className="wf-node-footer">
          <span className={`wf-node-agent-badge ${getAgentBadgeClass(node)}`}>
            {getAgentBadgeLabel(node)}
          </span>
          <span className="wf-node-timing">{'\u2014'}</span>
        </div>
      </div>

      {editing && (
        <div className="wf-node-edit-form nodrag" onMouseDown={(e) => e.stopPropagation()}>
          <input
            ref={nameInputRef}
            className="wf-node-edit-input nodrag"
            type="text"
            value={editName}
            placeholder="Node name"
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleEditKeyDown}
          />
          <textarea
            className="wf-node-edit-textarea nodrag"
            value={editRole}
            placeholder={getRoleLabel(node.type)}
            onChange={(e) => setEditRole(e.target.value)}
            onKeyDown={handleEditKeyDown}
          />
          {node.type === 'agent' && (
            <select
              className="wf-node-edit-select nodrag"
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
          <div className="wf-node-edit-actions">
            <button className="wf-node-edit-btn save nodrag" type="button" onClick={handleSave}>
              Save
            </button>
            <button className="wf-node-edit-btn cancel nodrag" type="button" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="wf-handle" />
    </div>
  )
}

export const WorkflowNodeComponent = memo(WorkflowNodeInner)
