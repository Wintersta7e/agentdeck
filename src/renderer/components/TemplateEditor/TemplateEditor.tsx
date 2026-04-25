import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Template,
  TemplateCategory,
  TemplateDraft,
  TemplateScope,
} from '../../../shared/types'
import { useAppStore } from '../../store/appStore'
import { useTemplates } from '../../hooks/useTemplates'
import { groupTemplates, CATEGORY_ORDER } from '../../utils/templateUtils'
import { Plus, ClipboardList } from 'lucide-react'
import './TemplateEditor.css'

/** Derive the save target (scope + projectId) for a template id. */
function saveRefFor(
  id: string | null,
  templates: Template[],
): { scope: TemplateScope; projectId: string | null; baseMtime?: number } {
  if (id) {
    const existing = templates.find((t) => t.id === id)
    if (existing) {
      return {
        scope: existing.scope,
        projectId: existing.projectId,
        baseMtime: existing.mtimeMs,
      }
    }
  }
  // Fall back to user scope for new templates.
  return { scope: 'user', projectId: null }
}

/** Badge colour for a project's stack badge. */
function badgeClass(badge: string | undefined): string {
  if (!badge) return 'te-badge-amber'
  const lower = badge.toLowerCase()
  if (lower === 'java' || lower === '.net') return 'te-badge-red'
  if (lower === 'python') return 'te-badge-blue'
  if (lower === 'go' || lower === 'rust') return 'te-badge-green'
  return 'te-badge-amber'
}

/** Look up a template by id from the templates array. */
function findTemplate(
  templates: Template[],
  id: string | null,
): { name: string; content: string; category: TemplateCategory | undefined } | null {
  if (!id) return null
  const t = templates.find((tpl) => tpl.id === id)
  if (!t) return null
  return { name: t.name, content: t.content, category: t.category }
}

export function TemplateEditor(): React.JSX.Element {
  const editingTemplateId = useAppStore((s) => s.editingTemplateId)
  const templates = useTemplates()
  const projects = useAppStore((s) => s.projects)
  const saveTemplate = useAppStore((s) => s.saveTemplate)
  const deleteTemplate = useAppStore((s) => s.deleteTemplate)
  const addNotification = useAppStore((s) => s.addNotification)

  // Currently selected template ID in the left panel.
  // Initialized from store's editingTemplateId.
  const [selectedId, setSelectedId] = useState<string | null>(editingTemplateId)

  // Local editing state — initialized from the template if one is selected.
  const [editingName, setEditingName] = useState<string>(() => {
    const tpl = findTemplate(templates, editingTemplateId)
    return tpl?.name ?? ''
  })
  const [editingContent, setEditingContent] = useState<string>(() => {
    const tpl = findTemplate(templates, editingTemplateId)
    return tpl?.content ?? ''
  })
  const [editingCategory, setEditingCategory] = useState<TemplateCategory | undefined>(() => {
    const tpl = findTemplate(templates, editingTemplateId)
    return tpl?.category
  })

  // Sync selection when editingTemplateId changes from sidebar clicks
  // (React "adjusting state during rendering" pattern — no useEffect needed)
  const [prevEditingId, setPrevEditingId] = useState(editingTemplateId)
  if (editingTemplateId !== prevEditingId) {
    setPrevEditingId(editingTemplateId)
    if (editingTemplateId && editingTemplateId !== selectedId) {
      const tpl = findTemplate(templates, editingTemplateId)
      setSelectedId(editingTemplateId)
      setEditingName(tpl?.name ?? '')
      setEditingContent(tpl?.content ?? '')
      setEditingCategory(tpl?.category)
    }
  }

  // Auto-select first template if none is selected
  const [prevAutoSelectDone, setPrevAutoSelectDone] = useState(false)
  if (!selectedId && !prevAutoSelectDone && templates.length > 0 && templates[0]) {
    setPrevAutoSelectDone(true)
    const first = templates[0]
    setSelectedId(first.id)
    setEditingName(first.name)
    setEditingContent(first.content)
    setEditingCategory(first.category)
  }

  // Memoize grouped templates to avoid re-computing on every render
  const groupedTemplates = useMemo(() => groupTemplates(templates), [templates])

  // Refs for scroll sync
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumsRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Find the saved template data
  const savedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  )

  // Dirty check: compare local state to saved data
  const isDirty = useMemo(() => {
    if (!savedTemplate) return editingName.length > 0 || editingContent.length > 0
    return (
      editingName !== savedTemplate.name ||
      editingContent !== savedTemplate.content ||
      editingCategory !== savedTemplate.category
    )
  }, [savedTemplate, editingName, editingContent, editingCategory])

  // Line numbers
  const lineCount = useMemo(() => {
    const count = editingContent.split('\n').length
    return count < 1 ? 1 : count
  }, [editingContent])

  // Projects that have this template attached
  const usedInProjects = useMemo(() => {
    if (!selectedId) return []
    return projects.filter((p) => p.attachedTemplates?.includes(selectedId))
  }, [projects, selectedId])

  // Sync scroll between textarea and line numbers
  const handleTextareaScroll = useCallback(() => {
    if (textareaRef.current && lineNumsRef.current) {
      lineNumsRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])

  // Handle save failures — show a notification and surface stale conflicts.
  const handleSaveError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('E_TEMPLATE_STALE')) {
        addNotification('warning', 'Template changed on disk — refresh and retry')
      } else {
        addNotification('error', `Failed to save template: ${msg}`)
      }
      window.agentDeck.log.send('warn', 'template-editor', 'save failed', { err: msg })
    },
    [addNotification],
  )

  // Select a template — auto-saves dirty changes, then switches
  const handleSelect = useCallback(
    (id: string) => {
      // Auto-save current template if dirty
      if (selectedId) {
        const current = templates.find((t) => t.id === selectedId)
        const nameChanged = current && editingName !== current.name
        const contentChanged = current && editingContent !== current.content
        const categoryChanged = current && editingCategory !== current.category
        if (nameChanged || contentChanged || categoryChanged) {
          const draft: TemplateDraft = {
            id: selectedId,
            name: editingName,
            description: editingContent.split('\n')[0]?.slice(0, 60) ?? '',
            content: editingContent,
            ...(editingCategory !== undefined ? { category: editingCategory } : {}),
          }
          const ref = saveRefFor(selectedId, templates)
          void saveTemplate(draft, ref.scope, ref.projectId, ref.baseMtime).catch(handleSaveError)
        }
      }
      const tpl = findTemplate(templates, id)
      setSelectedId(id)
      setEditingName(tpl?.name ?? '')
      setEditingContent(tpl?.content ?? '')
      setEditingCategory(tpl?.category)
    },
    [
      templates,
      selectedId,
      editingName,
      editingContent,
      editingCategory,
      saveTemplate,
      handleSaveError,
    ],
  )

  // Create new template — saves to user scope by default.
  const handleNew = useCallback(async () => {
    try {
      const draft: TemplateDraft = {
        name: 'New template',
        description: '',
        content: '',
      }
      const saved = await saveTemplate(draft, 'user', null)
      setSelectedId(saved.id)
      setEditingName(saved.name)
      setEditingContent(saved.content)
      setEditingCategory(saved.category)
      // Focus the name input after creation
      requestAnimationFrame(() => {
        nameInputRef.current?.focus()
        nameInputRef.current?.select()
      })
    } catch (err) {
      handleSaveError(err)
    }
  }, [saveTemplate, handleSaveError])

  // Save template
  const handleSave = useCallback(async () => {
    if (!selectedId) return
    const ref = saveRefFor(selectedId, templates)
    const draft: TemplateDraft = {
      id: selectedId,
      name: editingName,
      description: editingContent.split('\n')[0]?.slice(0, 60) ?? '',
      content: editingContent,
      ...(editingCategory !== undefined ? { category: editingCategory } : {}),
    }
    try {
      await saveTemplate(draft, ref.scope, ref.projectId, ref.baseMtime)
    } catch (err) {
      handleSaveError(err)
    }
  }, [
    selectedId,
    templates,
    editingName,
    editingContent,
    editingCategory,
    saveTemplate,
    handleSaveError,
  ])

  // Discard changes
  const handleDiscard = useCallback(() => {
    if (savedTemplate) {
      setEditingName(savedTemplate.name)
      setEditingContent(savedTemplate.content)
      setEditingCategory(savedTemplate.category)
    }
  }, [savedTemplate])

  // Delete template
  const handleDelete = useCallback(async () => {
    if (!selectedId) return
    const current = templates.find((t) => t.id === selectedId)
    if (!current) return
    try {
      await deleteTemplate({
        id: current.id,
        scope: current.scope,
        projectId: current.projectId,
      })
      // Read fresh merged list from the selector after the onChange event lands.
      const state = useAppStore.getState()
      const freshTemplates = state.userTemplates
      const first = freshTemplates[0]
      if (first) {
        setSelectedId(first.id)
        setEditingName(first.name)
        setEditingContent(first.content)
        setEditingCategory(first.category)
      } else {
        setSelectedId(null)
        setEditingName('')
        setEditingContent('')
        setEditingCategory(undefined)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addNotification('error', `Failed to delete template: ${msg}`)
      window.agentDeck.log.send('warn', 'template-editor', 'delete failed', { err: msg })
    }
  }, [selectedId, templates, deleteTemplate, addNotification])

  // Keyboard shortcuts: Ctrl+S to save, Delete to delete
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void handleSave()
      }
      if (e.key === 'Delete' && selectedId) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        // CQ-8: Confirm before deleting to prevent accidental loss
        const tplName = templates.find((t) => t.id === selectedId)?.name ?? 'this template'
        if (window.confirm(`Delete "${tplName}"? This cannot be undone.`)) {
          void handleDelete()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, handleDelete, selectedId, templates])

  return (
    <div className="template-editor">
      {/* ─── Left panel: template list ─── */}
      <div className="te-list-panel">
        <div className="te-list-header">
          <span className="te-list-title">Templates</span>
          <button
            className="te-list-add"
            onClick={() => void handleNew()}
            title="New template"
            aria-label="New template"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="te-list-body">
          {groupedTemplates.map((group) => (
            <div key={group.category} className="te-group">
              <div className="te-group-label">{group.category}</div>
              {group.templates.map((t) => (
                <div
                  key={t.id}
                  className={`te-row ${t.id === selectedId ? 'active' : ''}`}
                  onClick={() => handleSelect(t.id)}
                >
                  <div className="te-row-icon">
                    <ClipboardList size={14} />
                  </div>
                  <div className="te-row-body">
                    <div className="te-row-name">{t.name}</div>
                    <div className="te-row-desc">{t.description}</div>
                    <TemplateUsageLabel templateId={t.id} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Center + Right: editor main ─── */}
      <div className="te-editor-main">
        {selectedId ? (
          <>
            {/* Name bar */}
            <div className="te-namebar">
              <input
                ref={nameInputRef}
                className="te-name-input"
                type="text"
                placeholder="Template name..."
                aria-label="Template name"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
              />
              <div className="te-namebar-sep" />
              <select
                className="te-category-select"
                value={editingCategory ?? ''}
                onChange={(e) =>
                  setEditingCategory((e.target.value as TemplateCategory) || undefined)
                }
              >
                <option value="">No category</option>
                {CATEGORY_ORDER.filter((c) => c !== 'Other').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="te-namebar-sep" />
              <span className="te-char-count">{editingContent.length} chars</span>
            </div>

            {/* Editor body */}
            <div className="te-editor-body">
              {/* Write pane */}
              <div className="te-write-pane">
                <div className="te-pane-bar">
                  <div className="te-pane-bar-dot" />
                  Prompt body
                </div>
                <div className="te-line-nums" ref={lineNumsRef}>
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i} className="te-ln">
                      {i + 1}
                    </div>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  className="te-textarea"
                  placeholder="Write your prompt here..."
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  onScroll={handleTextareaScroll}
                />
              </div>

              {/* Preview pane */}
              <div className="te-preview-pane">
                <div className="te-pane-bar">Preview</div>
                <div className="te-preview-scroll">
                  {/* Chip preview */}
                  <div className="te-preview-block">
                    <div className="te-preview-block-label">Input bar chip</div>
                    <div className="te-chip-preview">
                      <ClipboardList size={14} />
                      <span>{editingName || '\u2014'}</span>
                    </div>
                  </div>

                  {/* Bubble preview */}
                  <div className="te-preview-block">
                    <div className="te-preview-block-label">Sent to agent as</div>
                    <div className="te-bubble">
                      <div className="te-bubble-head">
                        <div className="te-bubble-head-dot" />
                        agent message
                      </div>
                      <div className="te-bubble-text">
                        <span className="te-prompt-sym">{'\u203A'}</span>
                        <span>{editingContent}</span>
                      </div>
                    </div>
                  </div>

                  {/* Used in */}
                  <div className="te-preview-block">
                    <div className="te-preview-block-label">Used in</div>
                    {usedInProjects.length > 0 ? (
                      usedInProjects.map((p) => (
                        <div key={p.id} className="te-usage-row">
                          <div
                            className="te-usage-dot"
                            style={{
                              background: p.badge === 'Java' ? 'var(--red)' : 'var(--green)',
                            }}
                          />
                          <span className="te-usage-name">{p.name}</span>
                          {p.badge && (
                            <span className={`te-usage-badge ${badgeClass(p.badge)}`}>
                              {p.badge}
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="te-usage-empty">Not attached to any project</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="te-footer">
              <div className={`te-unsaved ${isDirty ? 'show' : ''}`}>
                <div className="te-unsaved-dot" />
                Unsaved
              </div>
              <div className="te-footer-spacer" />
              <button className="te-btn danger" onClick={() => void handleDelete()}>
                Delete
              </button>
              <button className="te-btn" onClick={handleDiscard}>
                Discard
              </button>
              <button className="te-btn primary" onClick={() => void handleSave()}>
                Save template
              </button>
            </div>
          </>
        ) : (
          <div className="te-empty-state">
            <div className="te-empty-icon">
              <ClipboardList size={24} />
            </div>
            <div>Select a template or create a new one</div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Small helper component for template usage labels in the list. */
function TemplateUsageLabel({ templateId }: { templateId: string }): React.JSX.Element | null {
  const projects = useAppStore((s) => s.projects)
  const used = useMemo(
    () => projects.filter((p) => p.attachedTemplates?.includes(templateId)),
    [projects, templateId],
  )
  if (used.length === 0) return null
  return <div className="te-row-usage">{used.map((p) => p.name).join(', ')}</div>
}
