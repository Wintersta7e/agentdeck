import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../appStore'

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
})

describe('setWorkflowStatus log eviction (LEAK-09)', () => {
  it('drops log buffer when a non-open workflow reaches a terminal state', () => {
    useAppStore.getState().addWorkflowLog('wf-bg', {
      id: 'e1',
      type: 'workflow:started',
      workflowId: 'wf-bg',
      message: 'go',
      timestamp: Date.now(),
    })
    expect(useAppStore.getState().workflowLogs['wf-bg']).toHaveLength(1)
    useAppStore.getState().setWorkflowStatus('wf-bg', 'done')
    expect(useAppStore.getState().workflowLogs['wf-bg']).toBeUndefined()
    // Status itself still persisted
    expect(useAppStore.getState().workflowStatuses['wf-bg']).toBe('done')
  })

  it('retains log buffer when the workflow tab IS open', () => {
    useAppStore.getState().openWorkflow('wf-open')
    useAppStore.getState().addWorkflowLog('wf-open', {
      id: 'e1',
      type: 'workflow:started',
      workflowId: 'wf-open',
      message: 'go',
      timestamp: Date.now(),
    })
    useAppStore.getState().setWorkflowStatus('wf-open', 'done')
    expect(useAppStore.getState().workflowLogs['wf-open']).toHaveLength(1)
  })

  it('does not drop on non-terminal status transitions', () => {
    useAppStore.getState().addWorkflowLog('wf-run', {
      id: 'e1',
      type: 'workflow:started',
      workflowId: 'wf-run',
      message: 'go',
      timestamp: Date.now(),
    })
    useAppStore.getState().setWorkflowStatus('wf-run', 'running')
    expect(useAppStore.getState().workflowLogs['wf-run']).toHaveLength(1)
  })
})
