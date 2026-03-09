import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRolesMap } from './useRolesMap'
import { useAppStore } from '../store/appStore'
import { makeRole } from '../../__test__/helpers'
import { act } from 'react'

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
})

describe('useRolesMap', () => {
  it('returns empty map when no roles', () => {
    const { result } = renderHook(() => useRolesMap())
    expect(result.current.size).toBe(0)
  })

  it('returns map keyed by role id', () => {
    const role1 = makeRole({ id: 'r1', name: 'Reviewer' })
    const role2 = makeRole({ id: 'r2', name: 'Developer' })
    useAppStore.setState({ roles: [role1, role2] })

    const { result } = renderHook(() => useRolesMap())
    expect(result.current.size).toBe(2)
    expect(result.current.get('r1')?.name).toBe('Reviewer')
    expect(result.current.get('r2')?.name).toBe('Developer')
  })

  it('returns stable reference when roles unchanged', () => {
    const role = makeRole({ id: 'r1' })
    useAppStore.setState({ roles: [role] })

    const { result, rerender } = renderHook(() => useRolesMap())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it('updates when roles change', () => {
    const role1 = makeRole({ id: 'r1' })
    useAppStore.setState({ roles: [role1] })

    const { result } = renderHook(() => useRolesMap())
    expect(result.current.size).toBe(1)

    act(() => {
      useAppStore.setState({ roles: [role1, makeRole({ id: 'r2' })] })
    })

    expect(result.current.size).toBe(2)
  })
})
