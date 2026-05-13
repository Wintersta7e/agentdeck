import { CH, workflowEventChannel } from '../../shared/ipc-channels'
import { ipcRenderer } from 'electron'
import type { AgentDeckBridge } from '../../shared/bridge'
import type { WorkflowEvent } from '../../shared/types'
import { SAFE_ID_RE } from '../../shared/validation'
import { onIpc } from './events'

type WorkflowsTemplatesBridge = Pick<AgentDeckBridge, 'workflows' | 'templates' | 'env' | 'files'>

export function createWorkflowsTemplatesBridge(): WorkflowsTemplatesBridge {
  return {
    workflows: {
      list: () => ipcRenderer.invoke(CH.workflowsList),
      load: (id) => ipcRenderer.invoke(CH.workflowsLoad, id),
      save: (workflow) => ipcRenderer.invoke(CH.workflowsSave, workflow),
      rename: (id, name) => ipcRenderer.invoke(CH.workflowsRename, id, name),
      delete: (id) => ipcRenderer.invoke(CH.workflowsDelete, id),
      export: (id) => ipcRenderer.invoke(CH.workflowsExport, id),
      import: (data, roleStrategy) => ipcRenderer.invoke(CH.workflowsImport, data, roleStrategy),
      duplicate: (id) => ipcRenderer.invoke(CH.workflowsDuplicate, id),
      listRuns: (workflowId) => ipcRenderer.invoke(CH.workflowsListRuns, workflowId),
      deleteRun: (runId) => ipcRenderer.invoke(CH.workflowsDeleteRun, runId),
      getRunning: () => ipcRenderer.invoke(CH.workflowsGetRunning),
      run: (id, path, variables) => ipcRenderer.invoke(CH.workflowRun, id, path, variables),
      stop: (id) => ipcRenderer.invoke(CH.workflowStop, id),
      resume: (id, nodeId) => ipcRenderer.invoke(CH.workflowResume, id, nodeId),
      onEvent: (workflowId, cb) => {
        if (typeof workflowId !== 'string' || !SAFE_ID_RE.test(workflowId)) return () => {}
        return onIpc<WorkflowEvent>(workflowEventChannel(workflowId), cb)
      },
    },
    templates: {
      listAll: (input) => ipcRenderer.invoke(CH.templatesListAll, input),
      activateProject: (projectId) => ipcRenderer.invoke(CH.templatesActivateProject, projectId),
      save: (draft, scope, projectId, baseMtime) =>
        ipcRenderer.invoke(CH.templatesSave, draft, scope, projectId, baseMtime),
      delete: (ref) => ipcRenderer.invoke(CH.templatesDelete, ref),
      incrementUsage: (ref) => ipcRenderer.invoke(CH.templatesIncrementUsage, ref),
      setPinned: (ref, pinned) => ipcRenderer.invoke(CH.templatesSetPinned, ref, pinned),
      onChange: (cb) => onIpc(CH.templatesChange, cb),
      onParseError: (cb) => onIpc(CH.templatesParseError, cb),
    },
    env: {
      getAgentPaths: () => ipcRenderer.invoke(CH.envGetAgentPaths),
      getAgentSnapshot: (opts) => ipcRenderer.invoke(CH.envGetAgentSnapshot, opts),
    },
    files: {
      listDir: (opts) => ipcRenderer.invoke(CH.filesListDir, opts),
      openExternal: (opts) => ipcRenderer.invoke(CH.filesOpenExternal, opts),
    },
  }
}
