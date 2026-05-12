import { ipcRenderer } from 'electron'
import type { AgentDeckBridge } from '../../shared/bridge'
import type { ActivityEvent } from '../../shared/types'
import { onIpc } from './events'

export function createPtyBridge(): AgentDeckBridge['pty'] {
  return {
    spawn: (sessionId, cols, rows, projectPath, startupCommands, env, agent, agentFlags) =>
      ipcRenderer.invoke(
        'pty:spawn',
        sessionId,
        cols,
        rows,
        projectPath,
        startupCommands,
        env,
        agent,
        agentFlags,
      ),
    write: (sessionId, data) => ipcRenderer.invoke('pty:write', sessionId, data),
    resize: (sessionId, cols, rows) => ipcRenderer.send('pty:resize', sessionId, cols, rows),
    kill: (sessionId) => ipcRenderer.invoke('pty:kill', sessionId),
    onData: (sessionId, cb) => onIpc<string>(`pty:data:${sessionId}`, cb),
    onExit: (sessionId, cb) => onIpc<number>(`pty:exit:${sessionId}`, cb),
    onActivity: (sessionId, cb) => onIpc<ActivityEvent>(`pty:activity:${sessionId}`, cb),
  }
}
