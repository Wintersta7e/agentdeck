import { CH } from '../../shared/ipc-channels'
import { ipcRenderer } from 'electron'
import type { AgentDeckBridge, AgentVersionInfo } from '../../shared/bridge'
import type { ContextResult } from '../../shared/context-types'
import { onIpc } from './events'

type ProjectsAgentsBridge = Pick<AgentDeckBridge, 'store' | 'agents' | 'projects' | 'skills'>

export function createProjectsAgentsBridge(): ProjectsAgentsBridge {
  return {
    store: {
      getProjects: () => ipcRenderer.invoke(CH.storeGetProjects),
      saveProject: (project) => ipcRenderer.invoke(CH.storeSaveProject, project),
      deleteProject: (id) => ipcRenderer.invoke(CH.storeDeleteProject, id),
      getTemplates: () => ipcRenderer.invoke(CH.storeGetTemplates),
      getRoles: () => ipcRenderer.invoke(CH.storeGetRoles),
      saveRole: (role) => ipcRenderer.invoke(CH.storeSaveRole, role),
      deleteRole: (id) => ipcRenderer.invoke(CH.storeDeleteRole, id),
    },
    agents: {
      check: () => ipcRenderer.invoke(CH.agentsCheck),
      getVisible: () => ipcRenderer.invoke(CH.agentsGetVisible),
      setVisible: (agents) => ipcRenderer.invoke(CH.agentsSetVisible, agents),
      checkUpdates: (installedAgents) => ipcRenderer.invoke(CH.agentsCheckUpdates, installedAgents),
      update: (agentId) => ipcRenderer.invoke(CH.agentsUpdate, agentId),
      onVersionInfo: (cb) => onIpc<AgentVersionInfo>(CH.agentsVersionInfo, cb),
      getEffectiveContext: (agentId) =>
        ipcRenderer.invoke(CH.agentsGetEffectiveContext, agentId) as Promise<
          ContextResult | { error: string }
        >,
      getEffectiveContextForLaunch: (agentId) =>
        ipcRenderer.invoke(CH.agentsGetEffectiveContextForLaunch, agentId) as Promise<
          ContextResult | { error: string }
        >,
      getEffectiveContextForModel: (agentId, modelId) =>
        ipcRenderer.invoke(CH.agentsGetEffectiveContextForModel, agentId, modelId) as Promise<
          ContextResult | { error: string }
        >,
      setContextOverride: (args) => ipcRenderer.invoke(CH.agentsSetContextOverride, args),
      getOverrides: () => ipcRenderer.invoke(CH.agentsGetOverrides),
    },
    projects: {
      detectStack: (path, distro) => ipcRenderer.invoke(CH.projectsDetectStack, path, distro),
      getDefaultDistro: () => ipcRenderer.invoke(CH.projectsGetDefaultDistro),
      readProjectFile: (projectPath, filename) =>
        ipcRenderer.invoke(CH.projectsReadFile, projectPath, filename),
      refreshMeta: (projectId) => ipcRenderer.invoke(CH.projectsRefreshMeta, projectId),
    },
    skills: {
      list: (opts) => ipcRenderer.invoke(CH.skillsList, opts),
    },
  }
}
