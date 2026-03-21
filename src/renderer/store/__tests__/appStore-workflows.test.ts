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
