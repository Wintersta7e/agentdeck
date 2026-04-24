import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { PromptsInspector } from '../PromptsInspector'
import { useAppStore } from '../../../store/appStore'
import type { Template } from '../../../../shared/types'

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 't1',
    name: 'Refactor target',
    description: 'Refactor a target file in place',
    content: 'Refactor the file please.',
    category: undefined,
    usageCount: 0,
    lastUsedAt: 0,
    pinned: false,
    scope: 'user',
    projectId: null,
    path: '/u/t1.json',
    mtimeMs: 0,
    ...overrides,
  }
}

const ptyWrite = vi.fn<
  (sessionId: string, data: string) => Promise<{ ok: boolean; error?: string }>
>(async () => ({ ok: true }))
const incrementUsage = vi.fn(async () => {})
const setPinned = vi.fn(async () => {})
const setSeedTemplateId = vi.fn()
const openTemplateEditor = vi.fn()
const addNotification = vi.fn()

beforeEach(() => {
  ptyWrite.mockReset()
  ptyWrite.mockResolvedValue({ ok: true })
  incrementUsage.mockReset()
  setPinned.mockReset()
  setSeedTemplateId.mockReset()
  openTemplateEditor.mockReset()
  addNotification.mockReset()

  // Mock window.agentDeck — overrides the basic mock from setup.renderer.ts.
  Object.defineProperty(window, 'agentDeck', {
    value: {
      pty: { write: ptyWrite },
      log: { send: vi.fn() },
    },
    writable: true,
    configurable: true,
  })

  useAppStore.setState({
    userTemplates: [
      makeTemplate({ id: 't1', name: 'Refactor target', pinned: false }),
      makeTemplate({
        id: 't2',
        name: 'Triage bug',
        description: 'Triage a bug from logs',
        pinned: true,
        usageCount: 12,
        lastUsedAt: Date.now() - 2 * 60 * 60 * 1000,
        category: 'Debug',
      }),
    ],
    projectTemplates: {},
    activeProjectTemplatesLoaded: null,
    sessions: {
      s1: {
        id: 's1',
        projectId: 'p1',
        status: 'running',
        startedAt: 0,
        approvalState: 'idle',
        seedTemplateId: 't2',
      },
    },
    activeSessionId: 's1',
    setPinned,
    incrementUsage,
    setSeedTemplateId,
    openTemplateEditor,
    addNotification,
  } as never)
})

afterEach(() => {
  cleanup()
})

describe('PromptsInspector', () => {
  it('renders the merged template list', () => {
    render(<PromptsInspector />)
    expect(screen.getByText('Refactor target')).toBeInTheDocument()
    expect(screen.getByText('Triage bug')).toBeInTheDocument()
  })

  it('filters by case-insensitive search', () => {
    render(<PromptsInspector />)
    const search = screen.getByLabelText('Search templates')
    fireEvent.change(search, { target: { value: 'TRIAGE' } })
    expect(screen.queryByText('Refactor target')).toBeNull()
    expect(screen.getByText('Triage bug')).toBeInTheDocument()
  })

  it('shows empty-search message for no matches', () => {
    render(<PromptsInspector />)
    fireEvent.change(screen.getByLabelText('Search templates'), {
      target: { value: 'nothing-matches' },
    })
    expect(screen.getByText(/No matches for/)).toBeInTheDocument()
  })

  it('clicking pin icon calls setPinned with negated state', () => {
    render(<PromptsInspector />)
    fireEvent.click(screen.getByLabelText('Pin Refactor target'))
    expect(setPinned).toHaveBeenCalledWith({ id: 't1', scope: 'user', projectId: null }, true)
  })

  it('renders ◆ IN USE marker for the seed template', () => {
    render(<PromptsInspector />)
    const triageRow = screen.getByText('Triage bug').closest('.prompts-inspector__row')
    expect(triageRow).not.toBeNull()
    expect(within(triageRow as HTMLElement).getByText(/IN USE/)).toBeInTheDocument()

    const refactorRow = screen.getByText('Refactor target').closest('.prompts-inspector__row')
    expect(refactorRow).not.toBeNull()
    expect(within(refactorRow as HTMLElement).queryByText(/IN USE/)).toBeNull()
  })

  it('inject happy path: write succeeds, then incrementUsage + setSeedTemplateId fire', async () => {
    render(<PromptsInspector />)
    fireEvent.click(screen.getByText('Refactor target'))
    fireEvent.click(screen.getByLabelText('Inject Refactor target'))

    await waitFor(() => {
      expect(ptyWrite).toHaveBeenCalledWith('s1', 'Refactor the file please.\n')
    })
    await waitFor(() => {
      expect(incrementUsage).toHaveBeenCalledWith({
        id: 't1',
        scope: 'user',
        projectId: null,
      })
    })
    expect(setSeedTemplateId).toHaveBeenCalledWith('s1', 't1')
    expect(addNotification).not.toHaveBeenCalled()
  })

  it('inject failure: surfaces error toast and skips usage/seed updates', async () => {
    ptyWrite.mockResolvedValueOnce({ ok: false, error: 'EPIPE' })
    render(<PromptsInspector />)
    fireEvent.click(screen.getByText('Refactor target'))
    fireEvent.click(screen.getByLabelText('Inject Refactor target'))

    await waitFor(() => {
      expect(addNotification).toHaveBeenCalledWith('error', 'Failed to inject template: EPIPE')
    })
    expect(incrementUsage).not.toHaveBeenCalled()
    expect(setSeedTemplateId).not.toHaveBeenCalled()
  })

  it('clicking Edit calls openTemplateEditor with template id', () => {
    render(<PromptsInspector />)
    fireEvent.click(screen.getByText('Refactor target'))
    fireEvent.click(screen.getByLabelText('Edit Refactor target'))
    expect(openTemplateEditor).toHaveBeenCalledWith('t1')
  })

  it('clicking + New calls openTemplateEditor with no argument', () => {
    render(<PromptsInspector />)
    fireEvent.click(screen.getByLabelText('New template'))
    expect(openTemplateEditor).toHaveBeenCalledWith()
  })
})
