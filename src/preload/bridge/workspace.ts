import { ipcRenderer } from 'electron'
import type { AgentDeckBridge } from '../../shared/bridge'
import type { ReviewItem, TokenUsage } from '../../shared/types'
import { onIpc } from './events'

type WorkspaceBridge = Pick<AgentDeckBridge, 'worktree' | 'home' | 'cost'>

export function createWorkspaceBridge(): WorkspaceBridge {
  return {
    worktree: {
      acquire: (projectId, sessionId) =>
        ipcRenderer.invoke('worktree:acquire', projectId, sessionId),
      inspect: (sessionId) => ipcRenderer.invoke('worktree:inspect', sessionId),
      discard: (sessionId) => ipcRenderer.invoke('worktree:discard', sessionId),
      keep: (sessionId) => ipcRenderer.invoke('worktree:keep', sessionId),
      releasePrimary: (projectId, sessionId) =>
        ipcRenderer.invoke('worktree:releasePrimary', projectId, sessionId),
    },
    home: {
      gitStatus: (projectId) => ipcRenderer.invoke('projects:gitStatus', projectId),
      pendingReviews: (projectId) => ipcRenderer.invoke('projects:pendingReviews', projectId),
      dismissReview: (reviewId) => ipcRenderer.invoke('projects:dismissReview', reviewId),
      costHistory: (days) => ipcRenderer.invoke('cost:getHistory', days),
      getBudget: () => ipcRenderer.invoke('cost:getBudget'),
      setBudget: (amount) => ipcRenderer.invoke('cost:setBudget', amount),
      onReviewsUpdated: (cb) => onIpc<ReviewItem[]>('home:reviewsUpdated', cb),
    },
    cost: {
      bind: (sessionId, opts) => ipcRenderer.invoke('cost:bind', sessionId, opts),
      unbind: (sessionId) => ipcRenderer.invoke('cost:unbind', sessionId),
      onUpdate: (cb) => onIpc<{ sessionId: string; usage: TokenUsage }>('cost:update', cb),
    },
  }
}
