import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useProjects } from '../../hooks/useProjects'
import './TemplateEditor.css'

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
  templates: { id: string; name: string; content?: string | undefined }[],
  id: string | null,
): { name: string; content: string } | null {
  if (!id) return null
  const t = templates.find((tpl) => tpl.id === id)
  if (!t) return null
  return { name: t.name, content: t.content ?? '' }
}

export function TemplateEditor(): React.JSX.Element {
  const editingTemplateId = useAppStore((s) => s.editingTemplateId)
  const templates = useAppStore((s) => s.templates)
  const projects = useAppStore((s) => s.projects)

  const { addTemplate, updateTemplate, deleteTemplate: removeTemplate } = useProjects()

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
    }
  }

  // Auto-select first template if none is selected
  if (!selectedId && templates.length > 0 && templates[0]) {
    const first = templates[0]
    setSelectedId(first.id)
    setEditingName(first.name)
    setEditingContent(first.content ?? '')
  }

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
    return editingName !== savedTemplate.name || editingContent !== (savedTemplate.content ?? '')
  }, [savedTemplate, editingName, editingContent])

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

  // Select a template — auto-saves dirty changes, then switches
  const handleSelect = useCallback(
    (id: string) => {
      // Auto-save current template if dirty
      if (selectedId) {
        const current = templates.find((t) => t.id === selectedId)
        const nameChanged = current && editingName !== current.name
        const contentChanged = current && editingContent !== (current.content ?? '')
        if (nameChanged || contentChanged) {
          void updateTemplate({
            id: selectedId,
            name: editingName,
            description: editingContent.split('\n')[0]?.slice(0, 60) ?? '',
            content: editingContent,
          }).catch(() => {})
        }
      }
      const tpl = findTemplate(templates, id)
      setSelectedId(id)
      setEditingName(tpl?.name ?? '')
      setEditingContent(tpl?.content ?? '')
    },
    [templates, selectedId, editingName, editingContent, updateTemplate],
  )

  // Create new template
  const handleNew = useCallback(async () => {
    try {
      const newId = `tpl-${Date.now()}`
      const saved = await addTemplate({
        id: newId,
        name: 'New template',
        description: '',
        content: '',
      })
      setSelectedId(saved.id)
      setEditingName(saved.name)
      setEditingContent(saved.content ?? '')
      // Focus the name input after creation
      requestAnimationFrame(() => {
        nameInputRef.current?.focus()
        nameInputRef.current?.select()
      })
    } catch {
      // Notification already dispatched by useProjects
    }
  }, [addTemplate])

  // Save template
  const handleSave = useCallback(async () => {
    if (!selectedId) return
    try {
      await updateTemplate({
        id: selectedId,
        name: editingName,
        description: editingContent.split('\n')[0]?.slice(0, 60) ?? '',
        content: editingContent,
      })
    } catch {
      // Notification already dispatched by useProjects
    }
  }, [selectedId, editingName, editingContent, updateTemplate])

  // Discard changes
  const handleDiscard = useCallback(() => {
    if (savedTemplate) {
      setEditingName(savedTemplate.name)
      setEditingContent(savedTemplate.content ?? '')
    }
  }, [savedTemplate])

  // Delete template
  const handleDelete = useCallback(async () => {
    if (!selectedId) return
    try {
      await removeTemplate(selectedId)
      // Read fresh state after deletion to avoid stale closure
      const freshTemplates = useAppStore.getState().templates
      const first = freshTemplates[0]
      if (first) {
        setSelectedId(first.id)
        setEditingName(first.name)
        setEditingContent(first.content ?? '')
      } else {
        setSelectedId(null)
        setEditingName('')
        setEditingContent('')
      }
    } catch {
      // Notification already dispatched by useProjects
    }
  }, [selectedId, removeTemplate])

  // Keyboard shortcuts: Ctrl+S to save, Delete to delete
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void handleSave()
      }
      if (e.key === 'Delete' && selectedId) {
        // Don't trigger when typing in an input/textarea
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        void handleDelete()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, handleDelete, selectedId])

  return (
    <div className="template-editor">
      {/* ─── Left panel: template list ─── */}
      <div className="te-list-panel">
        <div className="te-list-header">
          <span className="te-list-title">Templates</span>
          <button className="te-list-add" onClick={() => void handleNew()} title="New template">
            +
          </button>
        </div>
        <div className="te-list-body">
          <div className="te-section-label">All templates</div>
          {templates.map((t) => (
            <div
              key={t.id}
              className={`te-row ${t.id === selectedId ? 'active' : ''}`}
              onClick={() => handleSelect(t.id)}
            >
              <div className="te-row-icon">{'\u{1F4CB}'}</div>
              <div className="te-row-body">
                <div className="te-row-name">{t.name}</div>
                <div className="te-row-desc">{t.description}</div>
                <TemplateUsageLabel templateId={t.id} />
              </div>
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
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
              />
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
                      <span>{'\u{1F4CB}'}</span>
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
            <div className="te-empty-icon">{'\u{1F4CB}'}</div>
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
