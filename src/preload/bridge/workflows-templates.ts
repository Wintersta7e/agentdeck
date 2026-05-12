import { ipcRenderer } from 'electron'
import type { AgentDeckBridge } from '../../shared/bridge'
import type { WorkflowEvent } from '../../shared/types'
import { SAFE_ID_RE } from '../../shared/validation'
import { onIpc } from './events'

type WorkflowsTemplatesBridge = Pick<AgentDeckBridge, 'workflows' | 'templates' | 'env' | 'files'>

export function createWorkflowsTemplatesBridge(): WorkflowsTemplatesBridge {
  return {
    workflows: {
      list: () => ipcRenderer.invoke('workflows:list'),
      load: (id) => ipcRenderer.invoke('workflows:load', id),
      save: (workflow) => ipcRenderer.invoke('workflows:save', workflow),
      rename: (id, name) => ipcRenderer.invoke('workflows:rename', id, name),
      delete: (id) => ipcRenderer.invoke('workflows:delete', id),
      export: (id) => ipcRenderer.invoke('workflows:export', id),
      import: (data, roleStrategy) => ipcRenderer.invoke('workflows:import', data, roleStrategy),
      duplicate: (id) => ipcRenderer.invoke('workflows:duplicate', id),
      listRuns: (workflowId) => ipcRenderer.invoke('workflows:listRuns', workflowId),
      deleteRun: (runId) => ipcRenderer.invoke('workflows:deleteRun', runId),
      getRunning: () => ipcRenderer.invoke('workflows:getRunning'),
      run: (id, path, variables) => ipcRenderer.invoke('workflow:run', id, path, variables),
      stop: (id) => ipcRenderer.invoke('workflow:stop', id),
      resume: (id, nodeId) => ipcRenderer.invoke('workflow:resume', id, nodeId),
      onEvent: (workflowId, cb) => {
        if (typeof workflowId !== 'string' || !SAFE_ID_RE.test(workflowId)) return () => {}
        return onIpc<WorkflowEvent>(`workflow:event:${workflowId}`, cb)
      },
    },
    templates: {
      listAll: (input) => ipcRenderer.invoke('templates:listAll', input),
      activateProject: (projectId) => ipcRenderer.invoke('templates:activateProject', projectId),
      save: (draft, scope, projectId, baseMtime) =>
        ipcRenderer.invoke('templates:save', draft, scope, projectId, baseMtime),
      delete: (ref) => ipcRenderer.invoke('templates:delete', ref),
      incrementUsage: (ref) => ipcRenderer.invoke('templates:incrementUsage', ref),
      setPinned: (ref, pinned) => ipcRenderer.invoke('templates:setPinned', ref, pinned),
      onChange: (cb) => onIpc('templates:change', cb),
      onParseError: (cb) => onIpc('templates:parseError', cb),
    },
    env: {
      getAgentPaths: () => ipcRenderer.invoke('env:getAgentPaths'),
      getAgentSnapshot: (opts) => ipcRenderer.invoke('env:getAgentSnapshot', opts),
    },
    files: {
      listDir: (opts) => ipcRenderer.invoke('files:listDir', opts),
      openExternal: (opts) => ipcRenderer.invoke('files:openExternal', opts),
    },
  }
}
