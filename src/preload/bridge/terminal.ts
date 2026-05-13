import { CH, ptyDataChannel, ptyExitChannel, ptyActivityChannel } from '../../shared/ipc-channels'
import { ipcRenderer } from 'electron'
import type { AgentDeckBridge } from '../../shared/bridge'
import type { ActivityEvent } from '../../shared/types'
import { onIpc } from './events'

export function createPtyBridge(): AgentDeckBridge['pty'] {
  return {
    spawn: (sessionId, cols, rows, projectPath, startupCommands, env, agent, agentFlags) =>
      ipcRenderer.invoke(
        CH.ptySpawn,
        sessionId,
        cols,
        rows,
        projectPath,
        startupCommands,
        env,
        agent,
        agentFlags,
      ),
    write: (sessionId, data) => ipcRenderer.invoke(CH.ptyWrite, sessionId, data),
    resize: (sessionId, cols, rows) => ipcRenderer.send(CH.ptyResize, sessionId, cols, rows),
    kill: (sessionId) => ipcRenderer.invoke(CH.ptyKill, sessionId),
    onData: (sessionId, cb) => onIpc<string>(ptyDataChannel(sessionId), cb),
    onExit: (sessionId, cb) => onIpc<number>(ptyExitChannel(sessionId), cb),
    onActivity: (sessionId, cb) => onIpc<ActivityEvent>(ptyActivityChannel(sessionId), cb),
  }
}
