import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { List, useListRef } from 'react-window'
import type {
  WorkflowEvent,
  Workflow,
  WorkflowNodeStatus,
  WorkflowNodeType,
} from '../../../shared/types'
import './WorkflowLogPanel.css'

interface WorkflowLogPanelProps {
  events: WorkflowEvent[]
  workflow: Workflow | null
  nodeStatuses: Record<string, WorkflowNodeStatus>
  onResumeCheckpoint: (workflowId: string, nodeId: string) => void
  onClear: () => void
  /** M5: When true, the panel is visible — triggers react-window re-measurement */
  visible?: boolean | undefined
}

// ── Flat row model for virtualization ───────────────────────────────────────

type HeaderRow = { kind: 'header'; ev: WorkflowEvent }
type EntryRow = { kind: 'entry'; ev: WorkflowEvent }
type ResumeRow = { kind: 'resume'; ev: WorkflowEvent }
type LogRow = HeaderRow | EntryRow | ResumeRow

// Row pixel heights
const ROW_HEIGHT_HEADER = 34
const ROW_HEIGHT_ENTRY = 20
const AUTO_SCROLL_THRESHOLD = 20
const ROW_HEIGHT_RESUME = 36

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function getSourceClass(nodeType: WorkflowNodeType | 'system'): string {
  switch (nodeType) {
    case 'agent':
      return 'wf-log-src-agent'
    case 'shell':
      return 'wf-log-src-shell'
    case 'checkpoint':
      return 'wf-log-src-checkpoint'
    case 'condition':
      return 'wf-log-src-condition'
    case 'system':
      return 'wf-log-src-system'
  }
}

function getMessageClass(eventType: string): string {
  if (eventType === 'node:done' || eventType === 'workflow:done') return 'ok'
  if (eventType === 'node:error' || eventType === 'workflow:error') return 'err'
  if (
    eventType === 'workflow:started' ||
    eventType === 'workflow:stopped' ||
    eventType === 'node:started'
  )
    return 'dim'
  return ''
}

function isSystemEvent(eventType: string): boolean {
  return eventType.startsWith('workflow:')
}

// ── Row component props ───────────────────────────────────────────────────────

interface LogRowProps {
  rows: LogRow[]
  nodeMap: Map<string, { id: string; name: string; type: WorkflowNodeType }>
  nodeStatuses: Record<string, WorkflowNodeStatus>
  activeTab: string
  onResumeCheckpoint: (workflowId: string, nodeId: string) => void
}

function lookupNode(
  nodeId: string | undefined,
  nodeMap: Map<string, { id: string; name: string; type: WorkflowNodeType }>,
) {
  if (!nodeId) return undefined
  return nodeMap.get(nodeId)
}

function getNodeType(
  ev: WorkflowEvent,
  nodeMap: Map<string, { id: string; name: string; type: WorkflowNodeType }>,
): WorkflowNodeType | 'system' {
  if (isSystemEvent(ev.type)) return 'system'
  const node = lookupNode(ev.nodeId, nodeMap)
  return node?.type ?? 'agent'
}

function getSourceLabel(
  ev: WorkflowEvent,
  nodeMap: Map<string, { id: string; name: string; type: WorkflowNodeType }>,
): string {
  if (isSystemEvent(ev.type)) return 'sys'
  const node = lookupNode(ev.nodeId, nodeMap)
  return node?.name ?? 'node'
}

function getNodeHdrDotClass(
  nodeId: string,
  nodeStatuses: Record<string, WorkflowNodeStatus>,
): string {
  const status = nodeStatuses[nodeId]
  if (status === 'running') return 'wf-log-node-hdr-dot run'
  if (status === 'done') return 'wf-log-node-hdr-dot done'
  if (status === 'error') return 'wf-log-node-hdr-dot err'
  return 'wf-log-node-hdr-dot'
}

// ── Row renderer (must be a stable component outside the parent) ─────────────

function LogRowComponent({
  index,
  style,
  rows,
  nodeMap,
  nodeStatuses,
  activeTab,
  onResumeCheckpoint,
}: {
  index: number
  style: React.CSSProperties
  rows: LogRow[]
  nodeMap: Map<string, { id: string; name: string; type: WorkflowNodeType }>
  nodeStatuses: Record<string, WorkflowNodeStatus>
  activeTab: string
  onResumeCheckpoint: (workflowId: string, nodeId: string) => void
  ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' }
}): React.JSX.Element | null {
  const row = rows[index]
  if (!row) return null

  const { ev } = row

  if (row.kind === 'header') {
    return (
      <div style={style} className="wf-virt-row">
        {activeTab === 'all' && ev.nodeId && (
          <div className="wf-log-node-hdr">
            <div className={getNodeHdrDotClass(ev.nodeId, nodeStatuses)} />
            <div className="wf-log-node-hdr-name">{getSourceLabel(ev, nodeMap)}</div>
            <div className="wf-log-node-hdr-time">{formatTime(ev.timestamp)}</div>
          </div>
        )}
      </div>
    )
  }

  if (row.kind === 'resume') {
    const pausedNodeId = ev.nodeId
    return (
      <div style={style} className="wf-virt-row">
        {pausedNodeId && nodeStatuses[pausedNodeId] === 'paused' && (
          <div className="wf-log-resume-row">
            <button
              className="wf-log-resume-btn"
              type="button"
              onClick={() => onResumeCheckpoint(ev.workflowId, pausedNodeId)}
            >
              Resume
            </button>
          </div>
        )}
      </div>
    )
  }

  // kind === 'entry'
  const nodeType = getNodeType(ev, nodeMap)
  const srcClass = getSourceClass(nodeType)
  const msgClass = getMessageClass(ev.type)
  return (
    <div style={style} className="wf-virt-row">
      <div className="wf-log-entry">
        <span className="wf-log-time">{formatTime(ev.timestamp)}</span>
        <span className={`wf-log-source ${srcClass}`}>{getSourceLabel(ev, nodeMap)}</span>
        <span className={`wf-log-msg${msgClass ? ` ${msgClass}` : ''}`}>{ev.message}</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WorkflowLogPanel({
  events,
  workflow,
  nodeStatuses,
  onResumeCheckpoint,
  onClear,
  visible,
}: WorkflowLogPanelProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<string>('all')

  // Auto-scroll: track whether the user is near the bottom
  const autoScrollRef = useRef(true)
  const listRef = useListRef(null)

  // M9: Memoize node lookup map for O(1) access
  const nodeMap = useMemo(
    () =>
      new Map(workflow?.nodes.map((n) => [n.id, n]) ?? []) as Map<
        string,
        { id: string; name: string; type: WorkflowNodeType }
      >,
    [workflow],
  )

  // H5: Memoize node tabs
  const nodesWithEvents = useMemo(() => {
    const seen = new Set<string>()
    const ordered: { id: string; name: string }[] = []
    for (const ev of events) {
      if (ev.nodeId && !seen.has(ev.nodeId)) {
        seen.add(ev.nodeId)
        const node = nodeMap.get(ev.nodeId)
        ordered.push({ id: ev.nodeId, name: node?.name ?? ev.nodeId })
      }
    }
    return ordered
  }, [events, nodeMap])

  // Memoize filtered events
  const filteredEvents = useMemo(
    () => (activeTab === 'all' ? events : events.filter((ev) => ev.nodeId === activeTab)),
    [events, activeTab],
  )

  // Flatten filteredEvents into typed rows for the virtualized list
  const rows = useMemo<LogRow[]>(() => {
    const result: LogRow[] = []
    for (const ev of filteredEvents) {
      // Optional node section header (All tab only, on node:started)
      if (activeTab === 'all' && ev.type === 'node:started' && ev.nodeId) {
        result.push({ kind: 'header', ev })
      }
      // The log entry itself
      result.push({ kind: 'entry', ev })
      // Optional resume button
      if (ev.type === 'node:paused' && ev.nodeId) {
        result.push({ kind: 'resume', ev })
      }
    }
    return result
  }, [filteredEvents, activeTab])

  // Row height function — different heights per row kind
  const getRowHeight = useCallback(
    (index: number): number => {
      const row = rows[index]
      if (!row) return ROW_HEIGHT_ENTRY
      if (row.kind === 'header') return ROW_HEIGHT_HEADER
      if (row.kind === 'resume') return ROW_HEIGHT_RESUME
      return ROW_HEIGHT_ENTRY
    },
    [rows],
  )

  // Auto-scroll to bottom when new rows arrive
  useEffect(() => {
    if (!autoScrollRef.current || rows.length === 0) return
    listRef.current?.scrollToRow({ index: rows.length - 1, align: 'end' })
  }, [rows.length, listRef])

  // M5: Re-measure when tab becomes visible (display:none → flex breaks react-window).
  // react-window v2 doesn't expose resetAfterIndex — re-scroll to force layout recalc.
  useEffect(() => {
    if (visible && rows.length > 0) {
      // Trigger react-window remeasure via scrollToRow (avoids global resize event
      // which would also trigger xterm FitAddon in every open terminal pane)
      if (autoScrollRef.current) {
        listRef.current?.scrollToRow({ index: rows.length - 1, align: 'end' })
      }
    }
  }, [visible, listRef, rows.length])

  // Handle user scroll to detect if they've scrolled away from bottom
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    autoScrollRef.current = distFromBottom <= AUTO_SCROLL_THRESHOLD
  }, [])

  // Stable rowProps object — must be memoized to avoid unnecessary re-renders
  const rowProps = useMemo<LogRowProps>(
    () => ({ rows, nodeMap, nodeStatuses, activeTab, onResumeCheckpoint }),
    [rows, nodeMap, nodeStatuses, activeTab, onResumeCheckpoint],
  )

  return (
    <div className="wf-log-panel">
      <div className="wf-log-header">
        <span className="wf-log-title">Execution Log</span>
        <button className="wf-log-clear" onClick={onClear} type="button">
          Clear
        </button>
      </div>

      <div className="wf-log-tabs">
        <div
          className={`wf-log-tab${activeTab === 'all' ? ' active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All
        </div>
        {nodesWithEvents.map((n) => (
          <div
            key={n.id}
            className={`wf-log-tab${activeTab === n.id ? ' active' : ''}`}
            onClick={() => setActiveTab(n.id)}
          >
            {n.name}
          </div>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <div className="wf-log-body-virt">
          <div className="wf-log-entry">
            <span className="wf-log-time">&mdash;</span>
            <span className="wf-log-source wf-log-src-system">sys</span>
            <span className="wf-log-msg dim">Workflow ready. Press Run to start.</span>
          </div>
        </div>
      ) : (
        <List<LogRowProps>
          className="wf-log-body-virt"
          rowComponent={LogRowComponent}
          rowCount={rows.length}
          rowHeight={getRowHeight}
          rowProps={rowProps}
          listRef={listRef}
          onScroll={handleScroll}
          style={{ width: '100%' }}
        />
      )}
    </div>
  )
}
