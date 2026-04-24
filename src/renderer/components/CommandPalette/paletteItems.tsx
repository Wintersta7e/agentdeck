import {
  Settings,
  Info,
  Keyboard,
  SunMoon,
  Hexagon,
  PlusCircle,
  Terminal,
  Plus,
  ClipboardList,
} from 'lucide-react'
import { AGENTS as SHARED_AGENTS } from '../../../shared/agents'
import type { Project, LegacyTemplate as Template } from '../../../shared/types'

export type ScopeTab = 'projects' | 'templates' | 'sessions' | 'tools'

export type ResultType = 'session' | 'project' | 'template' | 'action'

export interface PaletteItem {
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

export const SCOPE_TABS: { label: string; value: ScopeTab }[] = [
  { label: 'Tools', value: 'tools' },
  { label: 'Projects', value: 'projects' },
  { label: 'Templates', value: 'templates' },
  { label: 'Sessions', value: 'sessions' },
]

export const SECTION_ORDER: { type: ResultType; label: string }[] = [
  { type: 'session', label: 'Active sessions' },
  { type: 'project', label: 'Projects' },
  { type: 'template', label: 'Templates' },
  { type: 'action', label: 'Tools' },
]

export const ALL_AGENTS = SHARED_AGENTS.map((a) => ({
  id: a.id,
  label: a.name,
  desc: a.description,
}))

interface SessionEntry {
  id: string
  projectId: string
  status: string
}

/**
 * Parse the serialised session snapshot string into structured entries.
 */
export function parseSessionSnapshot(snapshot: string): SessionEntry[] {
  if (!snapshot) return []
  return snapshot.split(',').map((e) => {
    const parts = e.split('|')
    return { id: parts[0] ?? '', projectId: parts[1] ?? '', status: parts[2] ?? '' }
  })
}

/**
 * Build the flat list of palette items from store data.
 * Pure function (aside from JSX icon elements) — no store access.
 */
export function buildPaletteItems(
  sessionSnapshot: string,
  projects: Project[],
  templates: Template[],
  activeSessionId: string | null,
): PaletteItem[] {
  const items: PaletteItem[] = []

  // Parse session snapshot
  const sessionEntries = parseSessionSnapshot(sessionSnapshot)

  for (const session of sessionEntries) {
    const project = session.projectId ? projects.find((p) => p.id === session.projectId) : undefined
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
  const settingsProject = resolveSettingsProject(sessionEntries, projects, activeSessionId)

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
}

/**
 * Resolve the best project for the Settings action.
 * Priority: active session's project > most recently opened > undefined.
 */
function resolveSettingsProject(
  sessionEntries: SessionEntry[],
  projects: Project[],
  activeSessionId: string | null,
): Project | undefined {
  const activeSess = activeSessionId
    ? sessionEntries.find((s) => s.id === activeSessionId)
    : undefined
  if (activeSess?.projectId) {
    const p = projects.find((proj) => proj.id === activeSess.projectId)
    if (p) return p
  }
  // Fall back to most recently used project
  const sorted = [...projects].sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0))
  return sorted[0]
}

/**
 * Filter items by scope tab and search query.
 */
export function filterPaletteItems(
  items: PaletteItem[],
  scope: ScopeTab,
  query: string,
): PaletteItem[] {
  const scopeTypeMap: Record<ScopeTab, ResultType> = {
    tools: 'action',
    projects: 'project',
    templates: 'template',
    sessions: 'session',
  }
  let filtered = items.filter((item) => item.type === scopeTypeMap[scope])

  if (query.trim()) {
    const lowerQuery = query.toLowerCase().trim()
    filtered = filtered.filter((item) => item.name.toLowerCase().includes(lowerQuery))
  }

  return filtered
}

/**
 * Group filtered items by section headers, preserving SECTION_ORDER.
 */
export function groupBySections(items: PaletteItem[]): { label: string; items: PaletteItem[] }[] {
  const sections: { label: string; items: PaletteItem[] }[] = []
  for (const { type, label } of SECTION_ORDER) {
    const sectionItems = items.filter((item) => item.type === type)
    if (sectionItems.length > 0) {
      sections.push({ label, items: sectionItems })
    }
  }
  return sections
}
