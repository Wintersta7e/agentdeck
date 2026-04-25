import { useState, useMemo, useCallback } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { HookEntry } from '../../../../shared/types'

interface Props {
  hooks: HookEntry[]
}

interface EventGroup {
  event: string
  entries: HookEntry[]
  scopes: Set<'user' | 'project'>
}

/**
 * Hooks grouped by event name. Each event row shows the count + scope badges.
 * Click (or Enter/Space on the focused row) expands to reveal each underlying
 * hook's command + matchers. Empty state: "No hooks configured."
 */
export function HooksSection({ hooks }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const groups: EventGroup[] = useMemo(() => {
    const map = new Map<string, EventGroup>()
    for (const h of hooks) {
      const cur = map.get(h.event)
      if (cur) {
        cur.entries.push(h)
        cur.scopes.add(h.scope)
      } else {
        map.set(h.event, { event: h.event, entries: [h], scopes: new Set([h.scope]) })
      }
    }
    return [...map.values()].sort((a, b) => a.event.localeCompare(b.event))
  }, [hooks])

  const toggle = useCallback((event: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(event)) next.delete(event)
      else next.add(event)
      return next
    })
  }, [])

  return (
    <section className="env-tab__section">
      <h3 className="env-tab__section-title">Hooks</h3>
      {groups.length === 0 ? (
        <div className="env-tab__empty-hint">No hooks configured.</div>
      ) : (
        <div className="env-tab__hooks">
          {groups.map((group) => {
            const isOpen = expanded.has(group.event)
            return (
              <div key={group.event} className="env-tab__hooks-event">
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  className="env-tab__hooks-event-row"
                  onClick={() => toggle(group.event)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggle(group.event)
                    }
                  }}
                >
                  <span className="env-tab__hooks-chevron" aria-hidden="true">
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                  <span className="env-tab__hooks-event-name">{group.event}</span>
                  <span className="env-tab__hooks-count">{group.entries.length}</span>
                  <span className="env-tab__hooks-scopes">
                    {[...group.scopes].sort().map((scope) => (
                      <span
                        key={scope}
                        className={`env-tab__scope-badge env-tab__scope-badge--${scope}`}
                      >
                        {scope}
                      </span>
                    ))}
                  </span>
                </div>
                {isOpen && (
                  <ul className="env-tab__hooks-detail">
                    {group.entries.map((entry, i) => (
                      <li key={`${entry.scope}-${i}`} className="env-tab__hooks-entry">
                        <div className="env-tab__hooks-entry-line">
                          <span
                            className={`env-tab__scope-badge env-tab__scope-badge--${entry.scope}`}
                          >
                            {entry.scope}
                          </span>
                          <code className="env-tab__hooks-cmd" title={entry.command}>
                            {entry.command}
                          </code>
                        </div>
                        {entry.matchers && entry.matchers.length > 0 && (
                          <div className="env-tab__hooks-matchers">
                            <span className="env-tab__hooks-matcher-label">matchers:</span>
                            {entry.matchers.map((m, mi) => (
                              <code key={mi} className="env-tab__hooks-matcher">
                                {m}
                              </code>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
