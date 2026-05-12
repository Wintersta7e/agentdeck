import { ipcRenderer } from 'electron'
import type { AgentDeckBridge, AgentVersionInfo } from '../../shared/bridge'
import type { ContextResult } from '../../shared/context-types'

type ProjectsAgentsBridge = Pick<AgentDeckBridge, 'store' | 'agents' | 'projects' | 'skills'>

export function createProjectsAgentsBridge(): ProjectsAgentsBridge {
  return {
    store: {
      getProjects: () => ipcRenderer.invoke('store:getProjects'),
      saveProject: (project) => ipcRenderer.invoke('store:saveProject', project),
      deleteProject: (id) => ipcRenderer.invoke('store:deleteProject', id),
      getTemplates: () => ipcRenderer.invoke('store:getTemplates'),
      getRoles: () => ipcRenderer.invoke('store:getRoles'),
      saveRole: (role) => ipcRenderer.invoke('store:saveRole', role),
      deleteRole: (id) => ipcRenderer.invoke('store:deleteRole', id),
    },
    agents: {
      check: () => ipcRenderer.invoke('agents:check'),
      getVisible: () => ipcRenderer.invoke('agents:getVisible'),
      setVisible: (agents) => ipcRenderer.invoke('agents:setVisible', agents),
      checkUpdates: (installedAgents) => ipcRenderer.invoke('agents:checkUpdates', installedAgents),
      update: (agentId) => ipcRenderer.invoke('agents:update', agentId),
      onVersionInfo: (cb) => {
        const handler = (_event: Electron.IpcRendererEvent, info: AgentVersionInfo): void =>
          cb(info)
        ipcRenderer.on('agents:versionInfo', handler)
        return () => ipcRenderer.removeListener('agents:versionInfo', handler)
      },
      getEffectiveContext: (agentId) =>
        ipcRenderer.invoke('agents:getEffectiveContext', agentId) as Promise<
          ContextResult | { error: string }
        >,
      getEffectiveContextForLaunch: (agentId) =>
        ipcRenderer.invoke('agents:getEffectiveContextForLaunch', agentId) as Promise<
          ContextResult | { error: string }
        >,
      getEffectiveContextForModel: (agentId, modelId) =>
        ipcRenderer.invoke('agents:getEffectiveContextForModel', agentId, modelId) as Promise<
          ContextResult | { error: string }
        >,
      setContextOverride: (args) => ipcRenderer.invoke('agents:setContextOverride', args),
      getOverrides: () => ipcRenderer.invoke('agents:getOverrides'),
    },
    projects: {
      detectStack: (path, distro) => ipcRenderer.invoke('projects:detectStack', path, distro),
      getDefaultDistro: () => ipcRenderer.invoke('projects:getDefaultDistro'),
      readProjectFile: (projectPath, filename) =>
        ipcRenderer.invoke('projects:readFile', projectPath, filename),
      refreshMeta: (projectId) => ipcRenderer.invoke('projects:refreshMeta', projectId),
    },
    skills: {
      list: (opts) => ipcRenderer.invoke('skills:list', opts),
    },
  }
}
