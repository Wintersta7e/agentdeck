import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from 'react'
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
}

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

export default function WorkflowLogPanel({
  events,
  workflow,
  nodeStatuses,
  onResumeCheckpoint,
  onClear,
}: WorkflowLogPanelProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<string>('all')
  const bodyRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  // M9: Memoize node lookup map for O(1) access instead of repeated .find()
  const nodeMap = useMemo(() => new Map(workflow?.nodes.map((n) => [n.id, n]) ?? []), [workflow])

  // H5: Memoize node tabs to avoid recomputation every render
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

  // Scroll handler — detect if user scrolled up
  const handleScroll = useCallback(() => {
    const el = bodyRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    autoScrollRef.current = distFromBottom <= 20
  }, [])

  // M5: Auto-scroll on new events using RAF to avoid forced reflow
  useEffect(() => {
    if (!autoScrollRef.current) return
    const raf = requestAnimationFrame(() => {
      const el = bodyRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(raf)
  }, [events])

  const lookupNode = (nodeId: string | undefined) => {
    if (!nodeId) return undefined
    return nodeMap.get(nodeId)
  }

  const getNodeType = (ev: WorkflowEvent): WorkflowNodeType | 'system' => {
    if (isSystemEvent(ev.type)) return 'system'
    const node = lookupNode(ev.nodeId)
    return node?.type ?? 'agent'
  }

  const getSourceLabel = (ev: WorkflowEvent): string => {
    if (isSystemEvent(ev.type)) return 'sys'
    const node = lookupNode(ev.nodeId)
    return node?.name ?? 'node'
  }

  const getNodeHdrDotClass = (nodeId: string): string => {
    const status = nodeStatuses[nodeId]
    if (status === 'running') return 'wf-log-node-hdr-dot run'
    if (status === 'done') return 'wf-log-node-hdr-dot done'
    if (status === 'error') return 'wf-log-node-hdr-dot err'
    return 'wf-log-node-hdr-dot'
  }

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

      <div className="wf-log-body" ref={bodyRef} onScroll={handleScroll}>
        {filteredEvents.length === 0 && (
          <div className="wf-log-entry">
            <span className="wf-log-time">&mdash;</span>
            <span className="wf-log-source wf-log-src-system">sys</span>
            <span className="wf-log-msg dim">Workflow ready. Press Run to start.</span>
          </div>
        )}

        {filteredEvents.map((ev) => {
          const nodeType = getNodeType(ev)
          const srcClass = getSourceClass(nodeType)
          const msgClass = getMessageClass(ev.type)
          const pausedNodeId = ev.nodeId

          return (
            <Fragment key={ev.id}>
              {/* Node section header for "All" tab when a node starts */}
              {activeTab === 'all' && ev.type === 'node:started' && ev.nodeId && (
                <div className="wf-log-node-hdr">
                  <div className={getNodeHdrDotClass(ev.nodeId)} />
                  <div className="wf-log-node-hdr-name">{getSourceLabel(ev)}</div>
                  <div className="wf-log-node-hdr-time">{formatTime(ev.timestamp)}</div>
                </div>
              )}

              {/* The actual log entry */}
              <div className="wf-log-entry">
                <span className="wf-log-time">{formatTime(ev.timestamp)}</span>
                <span className={`wf-log-source ${srcClass}`}>{getSourceLabel(ev)}</span>
                <span className={`wf-log-msg${msgClass ? ` ${msgClass}` : ''}`}>{ev.message}</span>
              </div>

              {/* Resume button for paused checkpoints */}
              {ev.type === 'node:paused' &&
                pausedNodeId &&
                nodeStatuses[pausedNodeId] === 'paused' && (
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
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
