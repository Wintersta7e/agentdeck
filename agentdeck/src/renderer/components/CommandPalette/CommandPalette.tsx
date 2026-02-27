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

const ALL_AGENTS = [
  { id: 'claude-code', label: 'Claude Code', desc: 'Anthropic CLI' },
  { id: 'codex', label: 'Codex', desc: 'OpenAI CLI' },
  { id: 'aider', label: 'Aider', desc: 'Git-aware agent' },
] as const

interface ThemeOption {
  id: string
  label: string
  accent: string
}

const THEME_GROUPS: { label: string; themes: ThemeOption[] }[] = [
  {
    label: 'Dark',
    themes: [
      { id: '', label: 'Amber', accent: '#f5a623' },
      { id: 'cyan', label: 'Navy + Cyan', accent: '#00d4ff' },
      { id: 'violet', label: 'Midnight + Violet', accent: '#a78bfa' },
      { id: 'ice', label: 'Charcoal + Ice', accent: '#60a5fa' },
    ],
  },
  {
    label: 'Light',
    themes: [
      { id: 'parchment', label: 'Parchment', accent: '#c87800' },
      { id: 'fog', label: 'Fog', accent: '#2563eb' },
      { id: 'lavender', label: 'Lavender', accent: '#6d28d9' },
      { id: 'stone', label: 'Stone', accent: '#0d9488' },
    ],
  },
]

const ALL_THEMES: ThemeOption[] = THEME_GROUPS.flatMap((g) => g.themes)

function applyThemeWithTransition(themeId: string, x?: number, y?: number): void {
  const apply = (): void => {
    document.documentElement.dataset.theme = themeId
  }

  if (!document.startViewTransition) {
    apply()
    return
  }

  // Set custom properties for the circular clip origin
  document.documentElement.style.setProperty('--reveal-x', `${x ?? window.innerWidth / 2}px`)
  document.documentElement.style.setProperty('--reveal-y', `${y ?? window.innerHeight / 2}px`)

  const transition = document.startViewTransition(apply)
  transition.finished.then(() => {
    document.documentElement.style.removeProperty('--reveal-x')
    document.documentElement.style.removeProperty('--reveal-y')
  })
}

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

  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const visibleAgents = useAppStore((s) => s.visibleAgents)
  const setVisibleAgents = useAppStore((s) => s.setVisibleAgents)

  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<ScopeTab>('all')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [subMenu, setSubMenu] = useState<'theme' | 'agents' | null>(null)
  const [previewOriginal, setPreviewOriginal] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const selectedIndexRef = useRef(selectedIndex)

  // Keep selectedIndexRef in sync with state
  useEffect(() => {
    selectedIndexRef.current = selectedIndex
  }, [selectedIndex])

  const subMenuRef = useRef(subMenu)
  useEffect(() => {
    subMenuRef.current = subMenu
  }, [subMenu])

  const previewOriginalRef = useRef(previewOriginal)
  useEffect(() => {
    previewOriginalRef.current = previewOriginal
  }, [previewOriginal])

  const visibleAgentsRef = useRef(visibleAgents)
  useEffect(() => {
    visibleAgentsRef.current = visibleAgents
  }, [visibleAgents])

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
    items.push({
      type: 'action',
      id: 'action-change-theme',
      icon: '\u25D1', // half circle
      iconClass: '',
      name: 'Change Theme',
      detail: 'Switch between 8 dark and light themes',
    })
    items.push({
      type: 'action',
      id: 'action-pinned-agents',
      icon: '\u2699', // gear
      iconClass: '',
      name: 'Pinned Agents',
      detail: 'Choose which agents appear on the home screen',
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
      // Theme sub-menu: don't close palette, show sub-menu instead
      if (item.id === 'action-change-theme') {
        setPreviewOriginal(theme)
        setSubMenu('theme')
        setSelectedIndex(ALL_THEMES.findIndex((t) => t.id === theme))
        return
      }

      // Agents sub-menu
      if (item.id === 'action-pinned-agents') {
        setSubMenu('agents')
        setSelectedIndex(0)
        return
      }

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
    [closePalette, onOpenProject, onAbout, theme],
  )

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Agents sub-menu keyboard handling
      if (subMenuRef.current === 'agents') {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          setSubMenu(null)
          setSelectedIndex(0)
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, ALL_AGENTS.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          return
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          const agent = ALL_AGENTS[selectedIndexRef.current]
          if (agent) {
            const current = visibleAgentsRef.current ?? ALL_AGENTS.map((a) => a.id)
            const isVisible = current.includes(agent.id)
            const updated = isVisible
              ? current.filter((id) => id !== agent.id)
              : [...current, agent.id]
            setVisibleAgents(updated)
          }
          return
        }
        return
      }

      // Theme sub-menu keyboard handling
      if (subMenuRef.current === 'theme') {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          document.documentElement.dataset.theme = previewOriginalRef.current
          setSubMenu(null)
          setSelectedIndex(0)
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, ALL_THEMES.length - 1))
          const nextIndex = Math.min(selectedIndexRef.current + 1, ALL_THEMES.length - 1)
          const nextTheme = ALL_THEMES[nextIndex]
          if (nextTheme) document.documentElement.dataset.theme = nextTheme.id
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          const prevIndex = Math.max(selectedIndexRef.current - 1, 0)
          const prevTheme = ALL_THEMES[prevIndex]
          if (prevTheme) document.documentElement.dataset.theme = prevTheme.id
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          const selected = ALL_THEMES[selectedIndexRef.current]
          if (selected) {
            applyThemeWithTransition(selected.id)
            setTheme(selected.id)
          }
          closePalette()
          return
        }
        return
      }

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
  }, [closePalette, flatItems, executeItem, setTheme, setVisibleAgents])

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
        {subMenu === 'agents' ? (
          <div className="palette-results">
            <div className="cp-submenu-header">
              <button
                className="cp-back-btn"
                onClick={() => {
                  setSubMenu(null)
                  setSelectedIndex(0)
                }}
              >
                {'\u2190'} back
              </button>
              <span>Pinned Agents</span>
            </div>
            {ALL_AGENTS.map((a, i) => {
              const current = visibleAgents ?? ALL_AGENTS.map((ag) => ag.id)
              const isVisible = current.includes(a.id)
              return (
                <div
                  key={a.id}
                  className={`cp-agent-item${selectedIndex === i ? ' selected' : ''}`}
                  onClick={() => {
                    const updated = isVisible
                      ? current.filter((id) => id !== a.id)
                      : [...current, a.id]
                    setVisibleAgents(updated)
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className={`cp-agent-check${isVisible ? ' checked' : ''}`}>
                    {isVisible ? '\u2611' : '\u2610'}
                  </span>
                  <span className="cp-agent-label">{a.label}</span>
                  <span className="cp-agent-desc">{a.desc}</span>
                </div>
              )
            })}
          </div>
        ) : subMenu === 'theme' ? (
          <div className="palette-results">
            <div className="cp-submenu-header">
              <button
                className="cp-back-btn"
                onClick={() => {
                  document.documentElement.dataset.theme = previewOriginal
                  setSubMenu(null)
                  setSelectedIndex(0)
                }}
              >
                {'\u2190'} back
              </button>
              <span>Change theme</span>
            </div>
            {THEME_GROUPS.map((group, gi) => {
              const groupOffset = THEME_GROUPS.slice(0, gi).reduce(
                (sum, g) => sum + g.themes.length,
                0,
              )
              return (
                <div key={group.label} className="cp-theme-group">
                  <div className="cp-theme-group-label">{group.label}</div>
                  {group.themes.map((t, ti) => {
                    const flatIdx = groupOffset + ti
                    return (
                      <div
                        key={t.id || 'default'}
                        className={`cp-theme-item${selectedIndex === flatIdx ? ' selected' : ''}${theme === t.id ? ' active' : ''}`}
                        onClick={(e) => {
                          applyThemeWithTransition(t.id, e.clientX, e.clientY)
                          setTheme(t.id)
                          closePalette()
                        }}
                        onMouseEnter={() => {
                          setSelectedIndex(flatIdx)
                          document.documentElement.dataset.theme = t.id
                        }}
                      >
                        <span className="cp-theme-swatch" style={{ background: t.accent }} />
                        <span className="cp-theme-label">{t.label}</span>
                        {theme === t.id && <span className="cp-theme-check">{'\u2713'}</span>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ) : (
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
        )}

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
