import { useState, useCallback, useRef, useEffect, memo } from 'react'
import { Bot, TerminalSquare, CircleCheck, GitBranch, MoreHorizontal } from 'lucide-react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type {
  WorkflowNode as WorkflowNodeType,
  WorkflowNodeStatus,
  WorkflowNodeType as NodeType,
  AgentType,
} from '../../../shared/types'
import { AGENTS } from '../../../shared/agents'
import { agentColorVar } from '../../utils/agent-ui'
import { useRolesMap } from '../../hooks/useRolesMap'
import './WorkflowNode.css'

export interface WorkflowNodeData {
  node: WorkflowNodeType
  status: WorkflowNodeStatus
  onUpdateNode: (node: WorkflowNodeType) => void
  onDeleteNode: (nodeId: string) => void
  onDuplicateNode: (nodeId: string) => void
  [key: string]: unknown
}

export type WfNode = Node<WorkflowNodeData, 'workflowNode'>

const KNOWN_AGENTS: AgentType[] = AGENTS.map((a) => a.id)

/**
 * Picks the CSS variable that drives a node's accent border, glow, glyph,
 * and type-notch colour. Agent nodes get their agent's signature token;
 * the other types map to a stable palette slot so a graph of mixed node
 * types still reads as a coloured flow.
 */
function getNodeAccentVar(node: WorkflowNodeType): string {
  if (node.type === 'agent' && node.agent) return `var(${agentColorVar(node.agent)})`
  if (node.type === 'shell') return 'var(--green)'
  if (node.type === 'condition') return 'var(--purple)'
  if (node.type === 'checkpoint') return 'var(--blue)'
  return 'var(--accent)'
}

function getTypeBadgeLabel(type: NodeType): string {
  if (type === 'agent') return 'Agent'
  if (type === 'shell') return 'Shell'
  if (type === 'condition') return 'Condition'
  return 'Checkpoint'
}

function getNodeText(node: WorkflowNodeType): string {
  if (node.type === 'agent') return node.prompt ?? ''
  if (node.type === 'shell') return node.command ?? ''
  if (node.type === 'condition')
    return node.conditionPattern ?? (node.conditionMode === 'exitCode' ? 'Exit code check' : '')
  return node.message ?? ''
}

function getTextLabel(type: NodeType): string {
  if (type === 'agent') return 'Task'
  if (type === 'shell') return 'Command'
  if (type === 'condition') return 'Condition'
  return 'Message'
}

function getTypeIcon(type: NodeType): React.ReactNode {
  if (type === 'agent') return <Bot size={14} />
  if (type === 'shell') return <TerminalSquare size={14} />
  if (type === 'condition') return <GitBranch size={14} />
  return <CircleCheck size={14} />
}

function WorkflowNodeInner({ data, selected }: NodeProps<WfNode>): React.JSX.Element {
  const { node, status, onUpdateNode, onDeleteNode, onDuplicateNode } = data
  const rolesMap = useRolesMap()
  const role = node.roleId ? rolesMap.get(node.roleId) : undefined

  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editName, setEditName] = useState(node.name)
  const [editRole, setEditRole] = useState(getNodeText(node))
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
    } else if (node.type === 'condition') {
      updated.conditionPattern = editRole
    } else {
      updated.message = editRole
    }
    onUpdateNode(updated)
    setEditing(false)
  }, [node, editName, editRole, editAgent, onUpdateNode])

  const handleCancel = useCallback(() => {
    setEditName(node.name)
    setEditRole(getNodeText(node))
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
    setEditRole(getNodeText(node))
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

  const handleMenuDuplicate = useCallback(() => {
    setMenuOpen(false)
    onDuplicateNode(node.id)
  }, [onDuplicateNode, node.id])

  const handleMenuDelete = useCallback(() => {
    setMenuOpen(false)
    onDeleteNode(node.id)
  }, [onDeleteNode, node.id])

  const className = ['wf-node-inner', status, selected ? 'selected' : ''].filter(Boolean).join(' ')

  const nodeText = getNodeText(node)
  const accentStyle = { '--node-accent': getNodeAccentVar(node) } as React.CSSProperties

  return (
    <div
      className={className}
      style={accentStyle}
      data-type={node.type}
      onDoubleClick={handleDoubleClick}
    >
      <Handle type="target" position={Position.Left} className="wf-handle" />

      <span className="wf-node-id-badge" aria-hidden="true">
        {getTypeBadgeLabel(node.type)}
      </span>

      <div className="wf-node-header">
        <span className="wf-node-type-icon">{getTypeIcon(node.type)}</span>
        <div className="wf-node-name">{node.name}</div>
        <button
          className="wf-node-menu nodrag"
          onClick={handleMenuClick}
          type="button"
          aria-label="Open node menu"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {menuOpen && (
        <div className="wf-node-dropdown" ref={menuRef}>
          <button className="wf-node-dropdown-item nodrag" onClick={handleMenuEdit} type="button">
            Edit
          </button>
          <button
            className="wf-node-dropdown-item nodrag"
            onClick={handleMenuDuplicate}
            type="button"
          >
            Duplicate
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
        {/* Role badge (agent nodes with a role assigned) */}
        {node.type === 'agent' && role && (
          <div className="wf-node-field">
            <div className="wf-node-field-label">Role</div>
            <div className="wf-node-role-badge">
              <span className="wf-node-role-badge-icon">{role.icon}</span> {role.name}
            </div>
          </div>
        )}

        {/* Agent name (agent nodes) */}
        {node.type === 'agent' && (
          <div className="wf-node-field">
            <div className="wf-node-field-label">Agent</div>
            <div className="wf-node-field-value">{node.agent ?? 'claude-code'}</div>
          </div>
        )}

        {/* Task / Command / Message */}
        {nodeText && (
          <div className="wf-node-field">
            <div className="wf-node-field-label">{getTextLabel(node.type)}</div>
            <div className="wf-node-field-value wf-node-field-truncated">{nodeText}</div>
          </div>
        )}
      </div>

      {editing && (
        <div className="wf-node-edit-form nodrag" onMouseDown={(e) => e.stopPropagation()}>
          <input
            ref={nameInputRef}
            className="wf-node-edit-input nodrag"
            type="text"
            aria-label="Node name"
            value={editName}
            placeholder="Node name"
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleEditKeyDown}
          />
          <textarea
            className="wf-node-edit-textarea nodrag"
            value={editRole}
            placeholder={getTextLabel(node.type)}
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

      {/* Output handles: condition nodes get true/false split handles */}
      {node.type === 'condition' ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="wf-handle wf-handle-true"
            style={{ top: '35%', background: 'var(--green)' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            className="wf-handle wf-handle-false"
            style={{ top: '65%', background: 'var(--red)' }}
          />
        </>
      ) : (
        <Handle type="source" position={Position.Right} className="wf-handle" />
      )}
    </div>
  )
}

export const WorkflowNodeComponent = memo(WorkflowNodeInner)
