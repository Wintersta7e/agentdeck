import type { AgentDeckBridge } from '../../shared/bridge'
import { createProjectsAgentsBridge } from './projects-agents'
import { createPtyBridge } from './terminal'
import { createSystemBridge } from './system'
import { createWorkspaceBridge } from './workspace'
import { createWorkflowsTemplatesBridge } from './workflows-templates'

export function createAgentDeckBridge(): AgentDeckBridge {
  return {
    pty: createPtyBridge(),
    ...createSystemBridge(),
    ...createProjectsAgentsBridge(),
    ...createWorkspaceBridge(),
    ...createWorkflowsTemplatesBridge(),
  }
}
