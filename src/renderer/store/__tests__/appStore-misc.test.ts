import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../appStore'

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
})

describe('simple setters', () => {
  it('setWslDistro stores value and defaults to empty string', () => {
    expect(useAppStore.getState().wslDistro).toBe('')
    useAppStore.getState().setWslDistro('Ubuntu-24.04')
    expect(useAppStore.getState().wslDistro).toBe('Ubuntu-24.04')
  })

  it('setRightPanelTab changes the active tab', () => {
    expect(useAppStore.getState().rightPanelTab).toBe('context')
    useAppStore.getState().setRightPanelTab('activity')
    expect(useAppStore.getState().rightPanelTab).toBe('activity')
    useAppStore.getState().setRightPanelTab('memory')
    expect(useAppStore.getState().rightPanelTab).toBe('memory')
  })

  it('setZoomFactor stores value and defaults to 1.0', () => {
    expect(useAppStore.getState().zoomFactor).toBe(1.0)
    useAppStore.getState().setZoomFactor(1.25)
    expect(useAppStore.getState().zoomFactor).toBe(1.25)
  })

  it('setWslDistro can be reset to empty string', () => {
    useAppStore.getState().setWslDistro('Debian')
    useAppStore.getState().setWslDistro('')
    expect(useAppStore.getState().wslDistro).toBe('')
  })
})
