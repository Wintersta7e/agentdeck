import { memo, useMemo, useState, useRef, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Pin, Search, Plus, Edit2, Send } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { getTemplatesForActiveProject } from '../../selectors/templates'
import type { Template } from '../../../shared/types'
import './PromptsInspector.css'

/** Format a unix-ms timestamp as a compact relative-time string. */
function formatRelative(ts: number): string {
  if (!ts || ts <= 0) return 'never'
  const diff = Date.now() - ts
  if (diff < 0) return 'just now'
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  const yr = Math.floor(day / 365)
  return `${yr}y ago`
}

export const PromptsInspector = memo(function PromptsInspector(): React.JSX.Element {
  // Use `useShallow` so React's useSyncExternalStore caches the result and
  // doesn't see a fresh array reference on every snapshot read.
  const templates = useAppStore(useShallow((s) => getTemplatesForActiveProject(s)))
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const activeSession = useAppStore((s) =>
    s.activeSessionId ? s.sessions[s.activeSessionId] : undefined,
  )
  const setPinned = useAppStore((s) => s.setPinned)
  const incrementUsage = useAppStore((s) => s.incrementUsage)
  const setSeedTemplateId = useAppStore((s) => s.setSeedTemplateId)
  const openTemplateEditor = useAppStore((s) => s.openTemplateEditor)
  const addNotification = useAppStore((s) => s.addNotification)

  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [injectFlash, setInjectFlash] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  // "/" to focus search input when the inspector has focus.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== '/') return
      const target = e.target as HTMLElement | null
      // Ignore "/" pressed inside an editable field — let the user type it.
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return templates
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    )
  }, [templates, query])

  const selected: Template | null = useMemo(() => {
    if (!selectedId) return null
    return templates.find((t) => t.id === selectedId) ?? null
  }, [templates, selectedId])

  const seedTemplateId = activeSession?.seedTemplateId ?? null
  const canInject = Boolean(activeSessionId && selected)

  const handlePinToggle = (tpl: Template, e: React.MouseEvent): void => {
    e.stopPropagation()
    void setPinned({ id: tpl.id, scope: tpl.scope, projectId: tpl.projectId }, !tpl.pinned)
  }

  const handleEdit = (): void => {
    if (!selected) return
    openTemplateEditor(selected.id)
  }

  const handleNew = (): void => {
    openTemplateEditor()
  }

  const handleInject = (): void => {
    if (!activeSessionId || !selected) return
    const tpl = selected
    const sessionId = activeSessionId

    void window.agentDeck.pty
      .write(sessionId, tpl.content + '\n')
      .then((result) => {
        if (!result.ok) {
          addNotification('error', `Failed to inject template: ${result.error ?? 'unknown error'}`)
          return
        }
        void incrementUsage({
          id: tpl.id,
          scope: tpl.scope,
          projectId: tpl.projectId,
        })
        setSeedTemplateId(sessionId, tpl.id)
        setInjectFlash(true)
        window.setTimeout(() => setInjectFlash(false), 600)
      })
      .catch((err: unknown) => {
        addNotification(
          'error',
          `Failed to inject template: ${err instanceof Error ? err.message : String(err)}`,
        )
      })
  }

  const empty = templates.length === 0
  const noMatches = !empty && filtered.length === 0

  return (
    <div className="prompts-inspector" ref={containerRef} tabIndex={-1}>
      <header className="prompts-inspector__header">
        <div className="prompts-inspector__title">PROMPTS</div>
        <div className="prompts-inspector__searchwrap">
          <Search size={12} className="prompts-inspector__search-icon" aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            className="prompts-inspector__search"
            placeholder="Search…"
            aria-label="Search templates"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="prompts-inspector__new"
          onClick={handleNew}
          aria-label="New template"
        >
          <Plus size={12} aria-hidden="true" />
          <span>New</span>
        </button>
      </header>

      <div className="prompts-inspector__list" role="list">
        {empty && (
          <div className="prompts-inspector__empty">
            No templates yet. Click + New to create one.
          </div>
        )}
        {noMatches && (
          <div className="prompts-inspector__empty">No matches for &lsquo;{query}&rsquo;.</div>
        )}
        {filtered.map((tpl) => {
          const isSelected = tpl.id === selectedId
          const inUse = seedTemplateId === tpl.id
          return (
            <div
              key={tpl.id}
              role="listitem"
              className={`prompts-inspector__row${isSelected ? ' is-selected' : ''}`}
            >
              <button
                type="button"
                className={`prompts-inspector__pin${tpl.pinned ? ' is-pinned' : ''}`}
                onClick={(e) => handlePinToggle(tpl, e)}
                aria-label={tpl.pinned ? `Unpin ${tpl.name}` : `Pin ${tpl.name}`}
                aria-pressed={tpl.pinned}
              >
                <Pin size={12} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="prompts-inspector__main"
                onClick={() => setSelectedId(tpl.id)}
                aria-pressed={isSelected}
              >
                <div className="prompts-inspector__row-line1">
                  <span className="prompts-inspector__name">{tpl.name}</span>
                  {inUse && (
                    <span className="prompts-inspector__inuse" aria-label="In use">
                      ◆ IN USE
                    </span>
                  )}
                </div>
                {tpl.description && (
                  <div className="prompts-inspector__desc">{tpl.description}</div>
                )}
                <div className="prompts-inspector__meta">
                  <span>
                    {tpl.usageCount} {tpl.usageCount === 1 ? 'use' : 'uses'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{formatRelative(tpl.lastUsedAt)}</span>
                  {tpl.category && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="prompts-inspector__badge prompts-inspector__badge--category">
                        {tpl.category}
                      </span>
                    </>
                  )}
                  <span
                    className={`prompts-inspector__badge prompts-inspector__badge--scope prompts-inspector__badge--scope-${tpl.scope}`}
                  >
                    {tpl.scope === 'user' ? 'USER' : 'PROJECT'}
                  </span>
                </div>
              </button>
            </div>
          )
        })}
      </div>

      <div className="prompts-inspector__preview">
        {selected ? (
          <>
            <div className="prompts-inspector__preview-header">
              <span className="prompts-inspector__preview-name">{selected.name}</span>
              <div className="prompts-inspector__preview-actions">
                <button
                  type="button"
                  className="prompts-inspector__action"
                  onClick={handleEdit}
                  aria-label={`Edit ${selected.name}`}
                >
                  <Edit2 size={12} aria-hidden="true" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  className={`prompts-inspector__action prompts-inspector__action--primary${injectFlash ? ' is-flashing' : ''}`}
                  onClick={handleInject}
                  disabled={!canInject}
                  title={!activeSessionId ? 'Open a session to inject.' : undefined}
                  aria-label={`Inject ${selected.name}`}
                >
                  <Send size={12} aria-hidden="true" />
                  <span>Inject →</span>
                </button>
              </div>
            </div>
            <pre className="prompts-inspector__pre">{selected.content}</pre>
          </>
        ) : (
          <div className="prompts-inspector__preview-hint">Select a template to preview.</div>
        )}
      </div>
    </div>
  )
})
