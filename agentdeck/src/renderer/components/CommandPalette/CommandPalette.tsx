import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { Project } from '../../../shared/types'
import './CommandPalette.css'

type ScopeTab = 'all' | 'projects' | 'templates' | 'sessions' | 'actions'

type ResultType = 'session' | 'project' | 'template' | 'action'

interface PaletteItem {
  type: ResultType
  id: string
  icon: string
  iconClass: string
  name: string
  detail: string
  badge?: string | undefined
  kbd?: string | undefined
  /** Original data reference for executing the action */
  data?: Project | undefined
}

interface CommandPaletteProps {
  onOpenProject: (project: Project) => void
  onAbout?: (() => void) | undefined
}

const SCOPE_TABS: { label: string; value: ScopeTab }[] = [
  { label: 'All', value: 'all' },
  { label: 'Projects', value: 'projects' },
  { label: 'Templates', value: 'templates' },
  { label: 'Sessions', value: 'sessions' },
  { label: 'Actions', value: 'actions' },
]

const SECTION_ORDER: { type: ResultType; label: string }[] = [
  { type: 'session', label: 'Active sessions' },
  { type: 'project', label: 'Projects' },
  { type: 'template', label: 'Templates' },
  { type: 'action', label: 'Actions' },
]

function highlightMatch(text: string, query: string): React.JSX.Element {
  if (!query) return <>{text}</>
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerText.indexOf(lowerQuery)
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="match">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

/**
 * Wrapper component that conditionally renders the palette inner.
 * By unmounting/remounting PaletteInner, we get fresh state each time the palette opens.
 */
export function CommandPalette({
  onOpenProject,
  onAbout,
}: CommandPaletteProps): React.JSX.Element | null {
  const isOpen = useAppStore((s) => s.commandPaletteOpen)

  if (!isOpen) return null

  return <PaletteInner onOpenProject={onOpenProject} onAbout={onAbout} />
}

function PaletteInner({ onOpenProject, onAbout }: CommandPaletteProps): React.JSX.Element {
  const closePalette = useAppStore((s) => s.closeCommandPalette)
  const sessions = useAppStore((s) => s.sessions)
  const projects = useAppStore((s) => s.projects)
  const templates = useAppStore((s) => s.templates)

  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<ScopeTab>('all')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const selectedIndexRef = useRef(selectedIndex)

  // Keep selectedIndexRef in sync with state
  useEffect(() => {
    selectedIndexRef.current = selectedIndex
  }, [selectedIndex])

  // Focus input on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }, [])

  // Build the full list of palette items from store data
  const allItems: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = []

    // Active sessions
    const sessionEntries = Object.values(sessions)
    for (const session of sessionEntries) {
      const project = projects.find((p) => p.id === session.projectId)
      if (!project) continue
      items.push({
        type: 'session',
        id: `session-${session.id}`,
        icon: '\u2B21', // hexagon
        iconClass: session.status === 'running' ? 'green' : session.status === 'error' ? 'red' : '',
        name: project.name,
        detail: `${project.path} \u00B7 ${session.status}`,
        badge: session.status === 'running' ? '\u25CF running' : session.status,
        data: project,
      })
    }

    // Projects (exclude those already shown as sessions)
    const sessionProjectIds = new Set(sessionEntries.map((s) => s.projectId))
    const pinned = projects.filter((p) => p.pinned && !sessionProjectIds.has(p.id))
    const recent = [...projects]
      .filter((p) => !p.pinned && !sessionProjectIds.has(p.id) && p.lastOpened)
      .sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0))
      .slice(0, 5)

    for (const project of [...pinned, ...recent]) {
      items.push({
        type: 'project',
        id: `project-${project.id}`,
        icon: '\u2B21',
        iconClass: '',
        name: project.name,
        detail: project.path,
        badge: project.badge,
        data: project,
      })
    }

    // Templates
    for (const tmpl of templates) {
      items.push({
        type: 'template',
        id: `template-${tmpl.id}`,
        icon: '\uD83D\uDCCB', // clipboard emoji
        iconClass: 'amber',
        name: tmpl.name,
        detail: tmpl.description || 'No description',
      })
    }

    // Actions
    items.push({
      type: 'action',
      id: 'action-new-project',
      icon: '+',
      iconClass: 'blue',
      name: 'New Project',
      detail: 'Open folder and configure a new project',
      kbd: 'Ctrl+N',
    })
    items.push({
      type: 'action',
      id: 'action-new-template',
      icon: '\u2295', // circled plus
      iconClass: 'purple',
      name: 'New Template',
      detail: 'Create a new prompt template',
    })
    items.push({
      type: 'action',
      id: 'action-settings',
      icon: '\u2699', // gear
      iconClass: '',
      name: 'Settings',
      detail: 'App settings, agents, keybindings',
      kbd: 'Ctrl+,',
    })
    items.push({
      type: 'action',
      id: 'action-about',
      icon: '\u24D8', // info circle
      iconClass: '',
      name: 'About',
      detail: 'Version info and credits',
    })

    return items
  }, [sessions, projects, templates])

  // Filter items by scope and query
  const filteredItems: PaletteItem[] = useMemo(() => {
    let items = allItems

    // Filter by scope tab
    if (scope !== 'all') {
      const scopeTypeMap: Record<ScopeTab, ResultType | null> = {
        all: null,
        projects: 'project',
        templates: 'template',
        sessions: 'session',
        actions: 'action',
      }
      const filterType = scopeTypeMap[scope]
      if (filterType) {
        items = items.filter((item) => item.type === filterType)
      }
    }

    // Filter by fuzzy search (substring match)
    if (query.trim()) {
      const lowerQuery = query.toLowerCase().trim()
      items = items.filter((item) => item.name.toLowerCase().includes(lowerQuery))
    }

    return items
  }, [allItems, scope, query])

  // Group filtered items by type with section headers
  const groupedSections: { label: string; items: PaletteItem[] }[] = useMemo(() => {
    const sections: { label: string; items: PaletteItem[] }[] = []
    for (const { type, label } of SECTION_ORDER) {
      const sectionItems = filteredItems.filter((item) => item.type === type)
      if (sectionItems.length > 0) {
        sections.push({ label, items: sectionItems })
      }
    }
    return sections
  }, [filteredItems])

  // Flat list for keyboard navigation
  const flatItems: PaletteItem[] = useMemo(() => {
    return groupedSections.flatMap((section) => section.items)
  }, [groupedSections])

  // Wrapper setters that also reset selectedIndex
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    setSelectedIndex(0)
  }, [])

  const handleScopeChange = useCallback((value: ScopeTab) => {
    setScope(value)
    setSelectedIndex(0)
  }, [])

  // Execute action for the selected item
  const executeItem = useCallback(
    (item: PaletteItem) => {
      closePalette()

      switch (item.type) {
        case 'session': {
          // Switch to the existing session
          const sessionId = item.id.replace('session-', '')
          useAppStore.getState().setActiveSession(sessionId)
          useAppStore.getState().setCurrentView('session')
          break
        }
        case 'project': {
          if (item.data) {
            onOpenProject(item.data)
          }
          break
        }
        case 'template': {
          const templateId = item.id.replace('template-', '')
          useAppStore.getState().openTemplateEditor(templateId)
          break
        }
        case 'action': {
          if (item.id === 'action-new-project') {
            useAppStore.getState().openWizard()
          } else if (item.id === 'action-new-template') {
            useAppStore.getState().openTemplateEditor()
          } else if (item.id === 'action-settings') {
            const firstProject = useAppStore.getState().projects[0]
            if (firstProject) {
              useAppStore.getState().openSettings(firstProject.id)
            }
          } else if (item.id === 'action-about') {
            onAbout?.()
          }
          break
        }
      }
    },
    [closePalette, onOpenProject, onAbout],
  )

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closePalette()
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % Math.max(flatItems.length, 1))
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(
          (prev) => (prev - 1 + Math.max(flatItems.length, 1)) % Math.max(flatItems.length, 1),
        )
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        const item = flatItems[selectedIndexRef.current]
        if (item) {
          executeItem(item)
        }
        return
      }
    }

    // Use capture phase so Escape is caught before App's handler
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [closePalette, flatItems, executeItem])

  // Scroll selected item into view
  useEffect(() => {
    if (!resultsRef.current) return
    const selectedEl = resultsRef.current.querySelector('.result-item.selected')
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Close on overlay click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        closePalette()
      }
    },
    [closePalette],
  )

  // Compute the global flat index offset for each section
  let globalIndex = 0

  return (
    <div className="palette-overlay" onClick={handleOverlayClick}>
      <div className="palette">
        {/* Search input */}
        <div className="palette-search">
          <span className="palette-search-icon">{'\u2318'}</span>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Open project, run template, switch session..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
          <span className="palette-esc">ESC</span>
        </div>

        {/* Scope tabs */}
        <div className="palette-scope">
          {SCOPE_TABS.map((tab) => (
            <button
              key={tab.value}
              className={`scope-tab${scope === tab.value ? ' active' : ''}`}
              onClick={() => handleScopeChange(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="palette-results" ref={resultsRef}>
          {flatItems.length === 0 && (
            <div className="palette-empty">
              {query ? `No results for "${query}"` : 'No items available'}
            </div>
          )}
          {groupedSections.map((section, sectionIdx) => {
            const sectionStartIndex = globalIndex
            const elements = (
              <div key={section.label}>
                <div className="result-section">{section.label}</div>
                {section.items.map((item, itemIdx) => {
                  const flatIdx = sectionStartIndex + itemIdx
                  const isSelected = flatIdx === selectedIndex
                  return (
                    <div
                      key={item.id}
                      className={`result-item${isSelected ? ' selected' : ''}`}
                      onClick={() => executeItem(item)}
                      onMouseEnter={() => setSelectedIndex(flatIdx)}
                    >
                      <div className={`result-icon${item.iconClass ? ` ${item.iconClass}` : ''}`}>
                        {item.icon}
                      </div>
                      <div className="result-body">
                        <div className="result-name">{highlightMatch(item.name, query)}</div>
                        <div className="result-detail">{item.detail}</div>
                      </div>
                      <div className="result-right">
                        {item.type === 'session' && item.badge && (
                          <span className="result-badge badge-running">{item.badge}</span>
                        )}
                        {item.type === 'project' && item.badge && (
                          <span className="result-badge badge-stack">{item.badge}</span>
                        )}
                        {item.type === 'template' && (
                          <span className="result-badge badge-template">template</span>
                        )}
                        {item.kbd && <span className="result-kbd">{item.kbd}</span>}
                        {isSelected && <span className="result-kbd">{'\u21B5'}</span>}
                      </div>
                    </div>
                  )
                })}
                {sectionIdx < groupedSections.length - 1 && <div className="result-divider" />}
              </div>
            )
            globalIndex += section.items.length
            return elements
          })}
        </div>

        {/* Footer */}
        <div className="palette-footer">
          <div className="footer-hint">
            <span className="footer-kbd">{'\u2191\u2193'}</span> navigate
          </div>
          <div className="footer-sep">{'\u00B7'}</div>
          <div className="footer-hint">
            <span className="footer-kbd">{'\u21B5'}</span> open
          </div>
          <div className="footer-sep">{'\u00B7'}</div>
          <div className="footer-hint">
            <span className="footer-kbd">ESC</span> close
          </div>
          <div className="palette-footer-right">
            {flatItems.length} result{flatItems.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
