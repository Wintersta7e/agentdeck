import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { NewSessionScreen } from './NewSessionScreen'
import { useAppStore } from '../../store/appStore'
import type { Project, Template } from '../../../shared/types'

const getEffectiveContext = vi.fn()
const getEffectiveContextForLaunch = vi.fn()
const saveTemplate = vi.fn()
const incrementUsage = vi.fn()

function project(overrides: Partial<Project>): Project {
  return {
    id: 'p1',
    name: 'Project One',
    path: '/repo/one',
    ...overrides,
  }
}

function template(overrides: Partial<Template> = {}): Template {
  return {
    id: 't1',
    name: 'Fix crash',
    description: 'Fix a reproducible crash',
    content: 'Fix the crash from the stack trace.',
    usageCount: 0,
    lastUsedAt: 0,
    pinned: false,
    scope: 'user',
    projectId: null,
    path: '/templates/t1.json',
    mtimeMs: 0,
    ...overrides,
  }
}

beforeEach(() => {
  getEffectiveContext.mockReturnValue(new Promise(() => {}))
  getEffectiveContextForLaunch.mockResolvedValue({
    value: 400_000,
    source: 'registry-exact',
    modelId: 'test-model',
  })
  saveTemplate.mockReset()
  incrementUsage.mockReset()
  saveTemplate.mockResolvedValue(template({ id: 'saved-template', name: 'Saved prompt' }))

  Object.defineProperty(window, 'agentDeck', {
    value: {
      agents: {
        getEffectiveContext,
        getEffectiveContextForLaunch,
      },
      log: { send: vi.fn(async () => {}) },
    },
    writable: true,
    configurable: true,
  })

  useAppStore.setState({
    ...useAppStore.getInitialState(),
    projects: [
      project({
        id: 'p1',
        name: 'Active Project',
        path: '/repo/active',
        lastOpened: 1,
        agents: [{ agent: 'codex', agentFlags: '--model gpt-5.4', isDefault: true }],
      }),
      project({
        id: 'p2',
        name: 'Recent Project',
        path: '/repo/recent',
        lastOpened: 10,
        agent: 'claude-code',
      }),
    ],
    sessions: {
      s1: {
        id: 's1',
        projectId: 'p1',
        status: 'running',
        startedAt: 1,
        approvalState: 'idle',
        seedTemplateId: null,
        agentOverride: 'codex',
      },
    },
    openSessionIds: ['s1'],
    activeSessionId: 's1',
    currentView: 'new-session',
    saveTemplate,
    incrementUsage,
  } as never)
})

afterEach(() => {
  cleanup()
})

describe('NewSessionScreen', () => {
  it('launches a new active-project session without requiring a prompt', async () => {
    render(<NewSessionScreen />)

    expect(screen.getByLabelText('Project')).toHaveValue('p1')
    const launch = screen.getByRole('button', { name: /launch session/i })
    expect(launch).toBeEnabled()

    fireEvent.click(launch)

    await waitFor(() => {
      const state = useAppStore.getState()
      const newId = state.activeSessionId
      expect(newId).not.toBe('s1')
      expect(newId).not.toBeNull()
      const created = newId ? state.sessions[newId] : undefined
      expect(created?.projectId).toBe('p1')
      expect(created?.agentOverride).toBe('codex')
      expect(created?.agentFlagsOverride).toBe('--model gpt-5.4')
      expect(created?.initialPrompt).toBeUndefined()
      expect(state.currentView).toBe('sessions')
    })
  })

  it('stores selected template metadata and usage when launching', async () => {
    const selected = template()
    useAppStore.setState({ userTemplates: [selected] } as never)

    render(<NewSessionScreen />)

    fireEvent.click(screen.getByRole('button', { name: /fix crash/i }))
    expect(screen.getByPlaceholderText(/Add jittered exponential backoff/)).toHaveValue(
      selected.content,
    )

    fireEvent.click(screen.getByRole('button', { name: /launch session/i }))

    await waitFor(() => {
      const state = useAppStore.getState()
      const newId = state.activeSessionId
      const created = newId ? state.sessions[newId] : undefined
      expect(created?.seedTemplateId).toBe('t1')
      expect(created?.initialPrompt).toBe(selected.content)
      expect(incrementUsage).toHaveBeenCalledWith({
        id: 't1',
        scope: 'user',
        projectId: null,
      })
    })
  })

  it('saves the prompt as a user template', async () => {
    render(<NewSessionScreen />)

    const save = screen.getByRole('button', { name: /save as template/i })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText(/Add jittered exponential backoff/), {
      target: { value: 'Investigate auth failure\nUse the failing test.' },
    })

    expect(save).toBeEnabled()
    fireEvent.click(save)

    await waitFor(() => {
      expect(saveTemplate).toHaveBeenCalledWith(
        {
          name: 'Investigate auth failure',
          description: 'Investigate auth failure',
          content: 'Investigate auth failure\nUse the failing test.',
        },
        'user',
        null,
      )
    })
    expect(useAppStore.getState().notifications.some((n) => n.kind === 'basic')).toBe(true)
  })
})
