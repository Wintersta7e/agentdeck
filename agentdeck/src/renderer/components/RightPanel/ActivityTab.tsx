import { useCallback, useMemo, useRef, useEffect } from 'react'
import { List, useListRef } from 'react-window'
import type { ActivityEvent } from '../../../shared/types'
import { useAppStore } from '../../store/appStore'
import './ActivityTab.css'

const EMPTY_EVENTS: ActivityEvent[] = []

// Row heights — title-only vs title+detail
const ROW_HEIGHT_TITLE_ONLY = 24
const ROW_HEIGHT_WITH_DETAIL = 44

interface ActivityRowProps {
  events: ActivityEvent[]
}

function ActivityRowComponent({
  index,
  style,
  events,
  ariaAttributes: _aria,
}: {
  index: number
  style: React.CSSProperties
  events: ActivityEvent[]
  ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' }
}): React.JSX.Element | null {
  const event = events[index]
  if (!event) return null

  const isLast = index === events.length - 1

  return (
    <div style={style}>
      <div className="activity-item">
        <div className="activity-line">
          <div className={`activity-dot ${event.status}`} />
          {!isLast && <div className="activity-connector" />}
        </div>
        <div className="activity-content">
          <div className="activity-title">{event.title}</div>
          {event.detail && <div className="activity-detail">{event.detail}</div>}
        </div>
      </div>
    </div>
  )
}

export function ActivityTab(): React.JSX.Element {
  const events = useAppStore((s) => {
    const sid = s.activeSessionId
    return sid ? (s.activityFeeds[sid] ?? EMPTY_EVENTS) : EMPTY_EVENTS
  })

  const listRef = useListRef(null)
  const autoScrollRef = useRef(true)

  // Row height function — check if detail exists to determine height
  const getRowHeight = useCallback(
    (index: number): number => {
      const ev = events[index]
      return ev?.detail ? ROW_HEIGHT_WITH_DETAIL : ROW_HEIGHT_TITLE_ONLY
    },
    [events],
  )

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (!autoScrollRef.current || events.length === 0) return
    listRef.current?.scrollToRow({ index: events.length - 1, align: 'end' })
  }, [events.length, listRef])

  // Detect if the user scrolled away from the bottom
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    autoScrollRef.current = distFromBottom <= 20
  }, [])

  const rowProps = useMemo<ActivityRowProps>(() => ({ events }), [events])

  if (events.length === 0) {
    return <div className="panel-placeholder">No activity yet</div>
  }

  // react-window v2: List auto-sizes from CSS. The container class
  // provides flex:1 + min-height:0 so the List fills available space.
  return (
    <List<ActivityRowProps>
      className="activity-virt-container"
      rowComponent={ActivityRowComponent}
      rowCount={events.length}
      rowHeight={getRowHeight}
      rowProps={rowProps}
      listRef={listRef}
      onScroll={handleScroll}
      style={{ width: '100%' }}
    />
  )
}
