import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, ArrowUp, ArrowDown, CornerDownLeft } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useTemplates } from '../../hooks/useTemplates'
import type { Project } from '../../../shared/types'
import { createBlankWorkflow } from '../../utils/workflowUtils'
import { ThemeSubmenu } from './ThemeSubmenu'
import { AgentsSubmenu } from './AgentsSubmenu'
import {
  type ScopeTab,
  type PaletteItem,
  SCOPE_TABS,
  ALL_AGENTS,
  buildPaletteItems,
  filterPaletteItems,
  groupBySections,
} from './paletteItems'
import { ALL_THEMES, THEME_GROUPS, applyThemeWithTransition } from './themeUtils'
import './CommandPalette.css'

interface CommandPaletteProps {
  onOpenProject: (project: Project) => void
  onAbout?: (() => void) | undefined
  onShortcuts?: (() => void) | undefined
  onNewTerminal?: (() => void) | undefined
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
  const templates = useTemplates()

  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const visibleAgents = useAppStore((s) => s.visibleAgents)
  const setVisibleAgents = useAppStore((s) => s.setVisibleAgents)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const setWorkflows = useAppStore((s) => s.setWorkflows)
  const openWorkflow = useAppStore((s) => s.openWorkflow)

  const paletteMode = useAppStore((s) => s.commandPaletteMode)
  const initialScope: ScopeTab =
    paletteMode === 'template' ? 'templates' : paletteMode === 'workflow' ? 'tools' : 'tools'

  const [query, setQuery] = useState(paletteMode === 'workflow' ? 'workflow' : '')
  const [scope, setScope] = useState<ScopeTab>(initialScope)
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
    const rafId = requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => cancelAnimationFrame(rafId)
  }, [])

  // Stable session snapshot — only changes when session list or statuses change,
  // serialized to a string so Zustand skips re-renders on unrelated store updates.
  const sessionSnapshot = useAppStore((s) => {
    const entries = Object.values(s.sessions)
    return entries.map((sess) => `${sess.id}|${sess.projectId}|${sess.status}`).join(',')
  })

  // Build the full list of palette items from store data
  const allItems = useMemo(
    () => buildPaletteItems(sessionSnapshot, projects, templates, activeSessionId),
    [sessionSnapshot, projects, templates, activeSessionId],
  )

  // Filter items by scope and query
  const filteredItems = useMemo(
    () => filterPaletteItems(allItems, scope, query),
    [allItems, scope, query],
  )

  // Group filtered items by type with section headers
  const groupedSections = useMemo(() => groupBySections(filteredItems), [filteredItems])

  // Flat list for keyboard navigation
  const flatItems = useMemo(
    () => groupedSections.flatMap((section) => section.items),
    [groupedSections],
  )

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
          useAppStore.getState().setCurrentView('sessions')
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
  // Pre-compute cumulative offsets so we don't mutate in render
  const sectionOffsets = useMemo(() => {
    const offsets: number[] = []
    let acc = 0
    for (const section of groupedSections) {
      offsets.push(acc)
      acc += section.items.length
    }
    return offsets
  }, [groupedSections])

  return (
    <div
      className="palette-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="palette">
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
              const sectionStartIndex = sectionOffsets[sectionIdx] ?? 0
              return (
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
      </div>
    </div>
  )
}
