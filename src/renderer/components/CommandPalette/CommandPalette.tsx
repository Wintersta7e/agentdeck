import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Settings,
  Info,
  Keyboard,
  SunMoon,
  Hexagon,
  PlusCircle,
  Terminal,
  Plus,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  ClipboardList,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { AGENTS as SHARED_AGENTS } from '../../../shared/agents'
import type { Project } from '../../../shared/types'
import { createBlankWorkflow } from '../../utils/workflowUtils'
import { PanelBox } from '../shared/PanelBox'
import { HexGrid } from '../shared/HexGrid'
import { ThemeSubmenu } from './ThemeSubmenu'
import { AgentsSubmenu } from './AgentsSubmenu'
import './CommandPalette.css'

type ScopeTab = 'projects' | 'templates' | 'sessions' | 'tools'

type ResultType = 'session' | 'project' | 'template' | 'action'

interface PaletteItem {
  type: ResultType
  id: string
  icon: React.ReactNode
  iconClass: string
  name: string
  detail: string
  badge?: string | undefined
  kbd?: string | undefined
  disabled?: boolean | undefined
  /** Original data reference for executing the action */
  data?: Project | undefined
}

interface CommandPaletteProps {
  onOpenProject: (project: Project) => void
  onAbout?: (() => void) | undefined
  onShortcuts?: (() => void) | undefined
  onNewTerminal?: (() => void) | undefined
}

const SCOPE_TABS: { label: string; value: ScopeTab }[] = [
  { label: 'Tools', value: 'tools' },
  { label: 'Projects', value: 'projects' },
  { label: 'Templates', value: 'templates' },
  { label: 'Sessions', value: 'sessions' },
]

const SECTION_ORDER: { type: ResultType; label: string }[] = [
  { type: 'session', label: 'Active sessions' },
  { type: 'project', label: 'Projects' },
  { type: 'template', label: 'Templates' },
  { type: 'action', label: 'Tools' },
]

const ALL_AGENTS = SHARED_AGENTS.map((a) => ({ id: a.id, label: a.name, desc: a.description }))

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

function applyThemeWithTransition(
  themeId: string,
  onApply?: () => void,
  x?: number,
  y?: number,
): void {
  const apply = (): void => {
    document.documentElement.dataset.theme = themeId
    onApply?.()
  }

  if (!document.startViewTransition) {
    apply()
    return
  }

  // Set custom properties for the circular clip origin
  document.documentElement.style.setProperty('--reveal-x', `${x ?? window.innerWidth / 2}px`)
  document.documentElement.style.setProperty('--reveal-y', `${y ?? window.innerHeight / 2}px`)

  const transition = document.startViewTransition({
    update: apply,
    types: ['theme-reveal'],
  })
  const cleanupRevealProps = (): void => {
    document.documentElement.style.removeProperty('--reveal-x')
    document.documentElement.style.removeProperty('--reveal-y')
  }
  transition.finished.then(cleanupRevealProps).catch(cleanupRevealProps)
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
  onShortcuts,
  onNewTerminal,
}: CommandPaletteProps): React.JSX.Element | null {
  const isOpen = useAppStore((s) => s.commandPaletteOpen)

  if (!isOpen) return null

  return (
    <PaletteInner
      onOpenProject={onOpenProject}
      onAbout={onAbout}
      onShortcuts={onShortcuts}
      onNewTerminal={onNewTerminal}
    />
  )
}

function PaletteInner({
  onOpenProject,
  onAbout,
  onShortcuts,
  onNewTerminal,
}: CommandPaletteProps): React.JSX.Element {
  const closePalette = useAppStore((s) => s.closeCommandPalette)
  const projects = useAppStore((s) => s.projects)
  const templates = useAppStore((s) => s.templates)

  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const visibleAgents = useAppStore((s) => s.visibleAgents)
  const setVisibleAgents = useAppStore((s) => s.setVisibleAgents)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const setWorkflows = useAppStore((s) => s.setWorkflows)
  const openWorkflow = useAppStore((s) => s.openWorkflow)

  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<ScopeTab>('tools')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const initialSubMenu = useAppStore((s) => s.commandPaletteInitialSubMenu)
  const [subMenu, setSubMenu] = useState<'theme' | 'agents' | null>(initialSubMenu)
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

  // Restore theme on unmount if palette closes while theme preview is active
  useEffect(() => {
    return () => {
      if (subMenuRef.current === 'theme') {
        document.documentElement.dataset.theme = previewOriginalRef.current
      }
    }
  }, [])

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

  // Stable session snapshot — only changes when session list or statuses change,
  // serialized to a string so Zustand skips re-renders on unrelated store updates.
  const sessionSnapshot = useAppStore((s) => {
    const entries = Object.values(s.sessions)
    return entries.map((sess) => `${sess.id}|${sess.projectId}|${sess.status}`).join(',')
  })

  // Build the full list of palette items from store data
  const allItems: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = []

    // Parse session snapshot
    const sessionEntries = sessionSnapshot
      ? sessionSnapshot.split(',').map((e) => {
          const parts = e.split('|')
          return { id: parts[0] ?? '', projectId: parts[1] ?? '', status: parts[2] ?? '' }
        })
      : []

    for (const session of sessionEntries) {
      const project = session.projectId
        ? projects.find((p) => p.id === session.projectId)
        : undefined
      const name = project ? project.name : 'Terminal'
      const detail = project ? `${project.path} \u00B7 ${session.status}` : session.status
      items.push({
        type: 'session',
        id: `session-${session.id}`,
        icon: project ? <Hexagon size={14} /> : <Terminal size={14} />,
        iconClass: session.status === 'running' ? 'green' : session.status === 'error' ? 'red' : '',
        name,
        detail,
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
        icon: <Hexagon size={14} />,
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
        icon: <ClipboardList size={14} />,
        iconClass: 'amber',
        name: tmpl.name,
        detail: tmpl.description || 'No description',
      })
    }

    // Actions
    items.push({
      type: 'action',
      id: 'action-new-project',
      icon: <Plus size={14} />,
      iconClass: 'blue',
      name: 'New Project',
      detail: 'Open folder and configure a new project',
      kbd: 'Ctrl+N',
    })
    items.push({
      type: 'action',
      id: 'action-new-terminal',
      icon: <Terminal size={14} />,
      iconClass: '',
      name: 'New Terminal',
      detail: 'Open a plain WSL shell',
      kbd: 'Ctrl+T',
    })
    items.push({
      type: 'action',
      id: 'action-new-template',
      icon: <PlusCircle size={14} />,
      iconClass: 'purple',
      name: 'New Template',
      detail: 'Create a new prompt template',
    })
    // Resolve the best project for Settings: active session's project > most recent > none
    const settingsProject = (() => {
      // Parse session snapshot to find active session's project
      const sessEntries = sessionSnapshot
        ? sessionSnapshot.split(',').map((e) => {
            const parts = e.split('|')
            return { id: parts[0] ?? '', projectId: parts[1] ?? '' }
          })
        : []
      const activeSess = activeSessionId
        ? sessEntries.find((s) => s.id === activeSessionId)
        : undefined
      if (activeSess?.projectId) {
        const p = projects.find((proj) => proj.id === activeSess.projectId)
        if (p) return p
      }
      // Fall back to most recently used project
      const sorted = [...projects].sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0))
      return sorted[0]
    })()

    const hasProjects = projects.length > 0
    items.push({
      type: 'action',
      id: 'action-settings',
      icon: <Settings size={14} />,
      iconClass: hasProjects ? '' : 'muted',
      name: 'Settings',
      detail: hasProjects
        ? `Project settings \u00B7 ${settingsProject?.name ?? 'Unknown'}`
        : 'Create a project first',
      kbd: hasProjects ? 'Ctrl+,' : undefined,
      disabled: !hasProjects,
    })
    items.push({
      type: 'action',
      id: 'action-about',
      icon: <Info size={14} />,
      iconClass: '',
      name: 'About',
      detail: 'Version info and credits',
    })
    items.push({
      type: 'action',
      id: 'action-shortcuts',
      icon: <Keyboard size={14} />,
      iconClass: '',
      name: 'Keyboard Shortcuts',
      detail: 'View all keyboard shortcuts',
      kbd: 'Ctrl+/',
    })
    items.push({
      type: 'action',
      id: 'action-change-theme',
      icon: <SunMoon size={14} />,
      iconClass: '',
      name: 'Change Theme',
      detail: 'Switch between 8 dark and light themes',
    })
    items.push({
      type: 'action',
      id: 'action-pinned-agents',
      icon: <Settings size={14} />,
      iconClass: '',
      name: 'Pinned Agents',
      detail: 'Choose which agents appear on the home screen',
    })
    items.push({
      type: 'action',
      id: 'action-new-workflow',
      icon: <Hexagon size={14} />,
      iconClass: 'purple',
      name: 'New Workflow',
      detail: 'Create a new agentic workflow',
    })

    return items
  }, [sessionSnapshot, projects, templates, activeSessionId])

  // Filter items by scope and query
  const filteredItems: PaletteItem[] = useMemo(() => {
    let items = allItems

    // Filter by scope tab
    const scopeTypeMap: Record<ScopeTab, ResultType> = {
      tools: 'action',
      projects: 'project',
      templates: 'template',
      sessions: 'session',
    }
    items = items.filter((item) => item.type === scopeTypeMap[scope])

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

  // Sub-menu callbacks
  const handleSubMenuBack = useCallback(() => {
    setSubMenu(null)
    setSelectedIndex(0)
  }, [])

  const handleThemeSelect = useCallback(
    (themeId: string, x?: number, y?: number) => {
      applyThemeWithTransition(themeId, () => setTheme(themeId), x, y)
      closePalette()
    },
    [setTheme, closePalette],
  )

  const handleAgentToggle = useCallback(
    (agentId: string) => {
      const current = visibleAgentsRef.current ?? ALL_AGENTS.map((a) => a.id)
      const isVisible = current.includes(agentId)
      const updated = isVisible ? current.filter((id) => id !== agentId) : [...current, agentId]
      setVisibleAgents(updated)
    },
    [setVisibleAgents],
  )

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
          } else if (item.id === 'action-new-terminal') {
            onNewTerminal?.()
          } else if (item.id === 'action-new-template') {
            useAppStore.getState().openTemplateEditor()
          } else if (item.id === 'action-settings') {
            if (item.disabled) break
            // Resolve best project: active session's project > most recent
            const state = useAppStore.getState()
            const activeSess = state.activeSessionId
              ? state.sessions[state.activeSessionId]
              : undefined
            const activeProject = activeSess?.projectId
              ? state.projects.find((p) => p.id === activeSess.projectId)
              : undefined
            const target =
              activeProject ??
              [...state.projects].sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0))[0]
            if (target) {
              state.openSettings(target.id)
            }
          } else if (item.id === 'action-about') {
            onAbout?.()
          } else if (item.id === 'action-shortcuts') {
            onShortcuts?.()
          } else if (item.id === 'action-new-workflow') {
            void createBlankWorkflow(setWorkflows, openWorkflow)
          }
          break
        }
      }
    },
    [
      closePalette,
      onOpenProject,
      onAbout,
      onShortcuts,
      onNewTerminal,
      theme,
      setWorkflows,
      openWorkflow,
    ],
  )

  // Keyboard navigation (main palette only — submenus handle their own keys)
  useEffect(() => {
    if (subMenu !== null) return

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
  }, [subMenu, closePalette, flatItems, executeItem])

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
    <div
      className="palette-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <HexGrid rotation={15} opacity={0.01} />
      <PanelBox corners="all" glow="none" className="palette">
        {/* Search input */}
        <div className="palette-search">
          <span className="palette-search-icon">
            <Search size={14} />
          </span>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Open project, run template, switch session..."
            aria-label="Command palette search"
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
          <AgentsSubmenu
            agents={ALL_AGENTS}
            visibleAgents={visibleAgents}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            onToggle={handleAgentToggle}
            onBack={handleSubMenuBack}
          />
        ) : subMenu === 'theme' ? (
          <ThemeSubmenu
            themeGroups={THEME_GROUPS}
            allThemes={ALL_THEMES}
            currentTheme={theme}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            onSelect={handleThemeSelect}
            onBack={handleSubMenuBack}
            previewOriginalRef={previewOriginalRef}
          />
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
                        className={`result-item${isSelected ? ' selected' : ''}${item.disabled ? ' disabled' : ''}`}
                        onClick={() => !item.disabled && executeItem(item)}
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
                          {isSelected && (
                            <span className="result-kbd">
                              <CornerDownLeft size={12} />
                            </span>
                          )}
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
            <span className="footer-kbd">
              <>
                <ArrowUp size={10} />
                <ArrowDown size={10} />
              </>
            </span>{' '}
            navigate
          </div>
          <div className="footer-sep">{'\u00B7'}</div>
          <div className="footer-hint">
            <span className="footer-kbd">
              <CornerDownLeft size={10} />
            </span>{' '}
            open
          </div>
          <div className="footer-sep">{'\u00B7'}</div>
          <div className="footer-hint">
            <span className="footer-kbd">ESC</span> close
          </div>
          <div className="palette-footer-right">
            {flatItems.length} result{flatItems.length !== 1 ? 's' : ''}
          </div>
        </div>
      </PanelBox>
    </div>
  )
}
