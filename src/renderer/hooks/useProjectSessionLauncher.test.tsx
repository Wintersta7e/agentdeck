import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Project } from '../../shared/types'

const { addSessionMock, captureMock, updateProjectMock } = vi.hoisted(() => ({
  addSessionMock: vi.fn(),
  captureMock: vi.fn().mockResolvedValue(undefined),
  updateProjectMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ addSession: addSessionMock, captureSessionSnapshot: captureMock }),
}))

vi.mock('./useProjects', () => ({
  useProjects: () => ({ updateProject: updateProjectMock }),
}))

import { useProjectSessionLauncher } from './useProjectSessionLauncher'

function project(over: Partial<Project>): Project {
  return { id: 'p1', name: 'P1', path: '/home/u/p1', ...over } as Project
}

beforeEach(() => {
  addSessionMock.mockClear()
  captureMock.mockClear()
  updateProjectMock.mockClear()
})

describe('useProjectSessionLauncher.openProject', () => {
  it('captures the snapshot for a MIGRATED project (agent in agents[], legacy field unset)', () => {
    const { result } = renderHook(() => useProjectSessionLauncher())
    result.current.openProject(project({ agents: [{ agent: 'codex', isDefault: true }] }))
    // Regression guard: reading project.agent directly would skip this entirely.
    expect(captureMock).toHaveBeenCalledTimes(1)
    expect(captureMock).toHaveBeenCalledWith(expect.any(String), 'codex')
  })

  it('captures the snapshot for a legacy project (flat agent field)', () => {
    const { result } = renderHook(() => useProjectSessionLauncher())
    result.current.openProject(project({ agent: 'aider' }))
    expect(captureMock).toHaveBeenCalledWith(expect.any(String), 'aider')
  })

  it('falls back to the default agent when a project has no agent configured', () => {
    const { result } = renderHook(() => useProjectSessionLauncher())
    result.current.openProject(project({}))
    expect(captureMock).toHaveBeenCalledWith(expect.any(String), 'claude-code')
  })
})
