import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../appStore'

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
})

describe('setWorkflowStatus', () => {
  it('sets status for a workflow', () => {
    useAppStore.getState().setWorkflowStatus('wf-1', 'running')
    expect(useAppStore.getState().workflowStatuses['wf-1']).toBe('running')
  })

  it('overwrites a previous status', () => {
    useAppStore.getState().setWorkflowStatus('wf-1', 'running')
    useAppStore.getState().setWorkflowStatus('wf-1', 'done')
    expect(useAppStore.getState().workflowStatuses['wf-1']).toBe('done')
  })

  it('does not affect other workflows', () => {
    useAppStore.getState().setWorkflowStatus('wf-1', 'running')
    useAppStore.getState().setWorkflowStatus('wf-2', 'error')
    expect(useAppStore.getState().workflowStatuses['wf-1']).toBe('running')
    expect(useAppStore.getState().workflowStatuses['wf-2']).toBe('error')
  })
})

describe('setWorkflowNodeStatus', () => {
  it('sets node status within a workflow', () => {
    useAppStore.getState().setWorkflowNodeStatus('wf-1', 'node-A', 'running')
    expect(useAppStore.getState().workflowNodeStatuses['wf-1']?.['node-A']).toBe('running')
  })

  it('preserves other nodes in the same workflow when updating one', () => {
    useAppStore.getState().setWorkflowNodeStatus('wf-1', 'node-A', 'done')
    useAppStore.getState().setWorkflowNodeStatus('wf-1', 'node-B', 'running')
    const nodes = useAppStore.getState().workflowNodeStatuses['wf-1']
    expect(nodes?.['node-A']).toBe('done')
    expect(nodes?.['node-B']).toBe('running')
  })
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
