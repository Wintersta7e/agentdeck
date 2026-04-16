import { describe, it, expect } from 'vitest'
import {
  parseSessionSnapshot,
  buildPaletteItems,
  filterPaletteItems,
  groupBySections,
  type PaletteItem,
} from '../paletteItems'
import type { Project, Template } from '../../../../shared/types'

// ── Factories ──

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'TestProject',
    path: '/home/user/project',
    pinned: true,
    badge: 'TS',
    agents: [],
    ...overrides,
  } as Project
}

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 't1',
    name: 'Code Review',
    description: 'Review code for bugs',
    category: 'review',
    content: 'Review this code',
    isBuiltin: true,
    ...overrides,
  } as Template
}

// ── parseSessionSnapshot ──

describe('parseSessionSnapshot', () => {
  it('returns empty array for empty string', () => {
    expect(parseSessionSnapshot('')).toEqual([])
  })

  it('parses single session', () => {
    const result = parseSessionSnapshot('s1|proj1|running')
    expect(result).toEqual([{ id: 's1', projectId: 'proj1', status: 'running' }])
  })

  it('parses multiple sessions', () => {
    const result = parseSessionSnapshot('s1|p1|running,s2|p2|exited,s3||idle')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ id: 's1', projectId: 'p1', status: 'running' })
    expect(result[1]).toEqual({ id: 's2', projectId: 'p2', status: 'exited' })
    expect(result[2]).toEqual({ id: 's3', projectId: '', status: 'idle' })
  })

  it('handles missing fields gracefully', () => {
    const result = parseSessionSnapshot('s1')
    expect(result[0]).toEqual({ id: 's1', projectId: '', status: '' })
  })
})

// ── buildPaletteItems ──

describe('buildPaletteItems', () => {
  it('returns action items even with no data', () => {
    const items = buildPaletteItems('', [], [], null)
    const actions = items.filter((i) => i.type === 'action')
    expect(actions.length).toBeGreaterThan(0)
    expect(actions.map((a) => a.id)).toContain('action-new-project')
    expect(actions.map((a) => a.id)).toContain('action-about')
    expect(actions.map((a) => a.id)).toContain('action-change-theme')
  })

  it('includes session items from snapshot', () => {
    const projects = [makeProject({ id: 'p1', name: 'MyApp' })]
    const items = buildPaletteItems('s1|p1|running', projects, [], null)
    const sessions = items.filter((i) => i.type === 'session')
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.name).toBe('MyApp')
    expect(sessions[0]?.iconClass).toBe('green')
  })

  it('session without project shows as Terminal', () => {
    const items = buildPaletteItems('s1||running', [], [], null)
    const sessions = items.filter((i) => i.type === 'session')
    expect(sessions[0]?.name).toBe('Terminal')
  })

  it('error sessions get red icon class', () => {
    const items = buildPaletteItems('s1||error', [], [], null)
    const sessions = items.filter((i) => i.type === 'session')
    expect(sessions[0]?.iconClass).toBe('red')
  })

  it('excludes session projects from project list', () => {
    const projects = [
      makeProject({ id: 'p1', name: 'InSession', pinned: true }),
      makeProject({ id: 'p2', name: 'NotInSession', pinned: true }),
    ]
    const items = buildPaletteItems('s1|p1|running', projects, [], null)
    const projectItems = items.filter((i) => i.type === 'project')
    expect(projectItems.map((p) => p.name)).toEqual(['NotInSession'])
  })

  it('includes pinned projects', () => {
    const projects = [makeProject({ id: 'p1', name: 'Pinned', pinned: true })]
    const items = buildPaletteItems('', projects, [], null)
    const projectItems = items.filter((i) => i.type === 'project')
    expect(projectItems[0]?.name).toBe('Pinned')
  })

  it('includes recent non-pinned projects (up to 5)', () => {
    const projects = Array.from({ length: 8 }, (_, i) =>
      makeProject({
        id: `p${i}`,
        name: `Proj${i}`,
        pinned: false,
        lastOpened: 1000 + i,
      }),
    )
    const items = buildPaletteItems('', projects, [], null)
    const projectItems = items.filter((i) => i.type === 'project')
    // 5 most recent
    expect(projectItems).toHaveLength(5)
    // Sorted by lastOpened descending
    expect(projectItems[0]?.name).toBe('Proj7')
  })

  it('includes template items', () => {
    const templates = [makeTemplate({ id: 't1', name: 'Review' })]
    const items = buildPaletteItems('', [], templates, null)
    const templateItems = items.filter((i) => i.type === 'template')
    expect(templateItems).toHaveLength(1)
    expect(templateItems[0]?.name).toBe('Review')
    expect(templateItems[0]?.iconClass).toBe('amber')
  })

  it('template without description shows fallback', () => {
    const templates = [makeTemplate({ description: '' })]
    const items = buildPaletteItems('', [], templates, null)
    const templateItems = items.filter((i) => i.type === 'template')
    expect(templateItems[0]?.detail).toBe('No description')
  })

  it('settings action is disabled when no projects', () => {
    const items = buildPaletteItems('', [], [], null)
    const settings = items.find((i) => i.id === 'action-settings')
    expect(settings?.disabled).toBe(true)
    expect(settings?.detail).toContain('Create a project first')
  })

  it('settings action resolves to active session project', () => {
    const projects = [
      makeProject({ id: 'p1', name: 'Active' }),
      makeProject({ id: 'p2', name: 'Other', lastOpened: 9999 }),
    ]
    const items = buildPaletteItems('s1|p1|running', projects, [], 's1')
    const settings = items.find((i) => i.id === 'action-settings')
    expect(settings?.detail).toContain('Active')
    expect(settings?.disabled).toBe(false)
  })

  it('settings action falls back to most recent project', () => {
    const projects = [
      makeProject({ id: 'p1', name: 'Old', lastOpened: 100 }),
      makeProject({ id: 'p2', name: 'Recent', lastOpened: 9999 }),
    ]
    const items = buildPaletteItems('', projects, [], null)
    const settings = items.find((i) => i.id === 'action-settings')
    expect(settings?.detail).toContain('Recent')
  })
})

// ── filterPaletteItems ──

describe('filterPaletteItems', () => {
  const items: PaletteItem[] = [
    { type: 'session', id: 's1', icon: null, iconClass: '', name: 'MyApp Session', detail: '' },
    { type: 'project', id: 'p1', icon: null, iconClass: '', name: 'MyApp', detail: '' },
    { type: 'project', id: 'p2', icon: null, iconClass: '', name: 'OtherProject', detail: '' },
    { type: 'template', id: 't1', icon: null, iconClass: '', name: 'Code Review', detail: '' },
    { type: 'action', id: 'a1', icon: null, iconClass: '', name: 'New Project', detail: '' },
    { type: 'action', id: 'a2', icon: null, iconClass: '', name: 'About', detail: '' },
  ]

  it('filters by scope tab', () => {
    expect(filterPaletteItems(items, 'projects', '')).toHaveLength(2)
    expect(filterPaletteItems(items, 'sessions', '')).toHaveLength(1)
    expect(filterPaletteItems(items, 'templates', '')).toHaveLength(1)
    expect(filterPaletteItems(items, 'tools', '')).toHaveLength(2)
  })

  it('filters by query within scope', () => {
    const result = filterPaletteItems(items, 'projects', 'myapp')
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('MyApp')
  })

  it('query is case-insensitive', () => {
    expect(filterPaletteItems(items, 'projects', 'MYAPP')).toHaveLength(1)
    expect(filterPaletteItems(items, 'projects', 'myAPP')).toHaveLength(1)
  })

  it('trims whitespace from query', () => {
    expect(filterPaletteItems(items, 'projects', '  MyApp  ')).toHaveLength(1)
  })

  it('returns all scope items when query is empty', () => {
    expect(filterPaletteItems(items, 'tools', '')).toHaveLength(2)
    expect(filterPaletteItems(items, 'tools', '   ')).toHaveLength(2)
  })

  it('returns empty for non-matching query', () => {
    expect(filterPaletteItems(items, 'projects', 'zzzzz')).toHaveLength(0)
  })
})

// ── groupBySections ──

describe('groupBySections', () => {
  it('groups items by type in SECTION_ORDER', () => {
    const items: PaletteItem[] = [
      { type: 'action', id: 'a1', icon: null, iconClass: '', name: 'Action', detail: '' },
      { type: 'project', id: 'p1', icon: null, iconClass: '', name: 'Project', detail: '' },
      { type: 'session', id: 's1', icon: null, iconClass: '', name: 'Session', detail: '' },
    ]
    const sections = groupBySections(items)
    expect(sections.map((s) => s.label)).toEqual(['Active sessions', 'Projects', 'Tools'])
  })

  it('omits empty sections', () => {
    const items: PaletteItem[] = [
      { type: 'action', id: 'a1', icon: null, iconClass: '', name: 'Action', detail: '' },
    ]
    const sections = groupBySections(items)
    expect(sections).toHaveLength(1)
    expect(sections[0]?.label).toBe('Tools')
  })

  it('returns empty array for no items', () => {
    expect(groupBySections([])).toEqual([])
  })

  it('preserves item order within sections', () => {
    const items: PaletteItem[] = [
      { type: 'project', id: 'p1', icon: null, iconClass: '', name: 'Alpha', detail: '' },
      { type: 'project', id: 'p2', icon: null, iconClass: '', name: 'Beta', detail: '' },
      { type: 'project', id: 'p3', icon: null, iconClass: '', name: 'Gamma', detail: '' },
    ]
    const sections = groupBySections(items)
    expect(sections[0]?.items.map((i) => i.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })
})
