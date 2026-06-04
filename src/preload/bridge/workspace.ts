import { CH } from '../../shared/ipc-channels'
import { ipcRenderer } from 'electron'
import type { AgentDeckBridge } from '../../shared/bridge'
import type { ReviewItem, TokenUsage } from '../../shared/types'
import { onIpc } from './events'

type WorkspaceBridge = Pick<AgentDeckBridge, 'worktree' | 'home' | 'cost' | 'usage'>

export function createWorkspaceBridge(): WorkspaceBridge {
  return {
    worktree: {
      acquire: (projectId, sessionId) =>
        ipcRenderer.invoke(CH.worktreeAcquire, projectId, sessionId),
      inspect: (sessionId) => ipcRenderer.invoke(CH.worktreeInspect, sessionId),
      discard: (sessionId) => ipcRenderer.invoke(CH.worktreeDiscard, sessionId),
      keep: (sessionId) => ipcRenderer.invoke(CH.worktreeKeep, sessionId),
      releasePrimary: (projectId, sessionId) =>
        ipcRenderer.invoke(CH.worktreeReleasePrimary, projectId, sessionId),
    },
    home: {
      gitStatus: (projectId) => ipcRenderer.invoke(CH.projectsGitStatus, projectId),
      pendingReviews: (projectId) => ipcRenderer.invoke(CH.projectsPendingReviews, projectId),
      dismissReview: (reviewId) => ipcRenderer.invoke(CH.projectsDismissReview, reviewId),
      costHistory: (days) => ipcRenderer.invoke(CH.costGetHistory, days),
      getBudget: () => ipcRenderer.invoke(CH.costGetBudget),
      setBudget: (amount) => ipcRenderer.invoke(CH.costSetBudget, amount),
      onReviewsUpdated: (cb) => onIpc<ReviewItem[]>(CH.homeReviewsUpdated, cb),
    },
    cost: {
      bind: (sessionId, opts) => ipcRenderer.invoke(CH.costBind, sessionId, opts),
      unbind: (sessionId) => ipcRenderer.invoke(CH.costUnbind, sessionId),
      onUpdate: (cb) => onIpc<{ sessionId: string; usage: TokenUsage }>(CH.costUpdate, cb),
    },
    usage: {
      recordSession: (rec) => ipcRenderer.invoke(CH.usageRecordSession, rec),
      getHistory: (days) => ipcRenderer.invoke(CH.usageGetHistory, days),
    },
  }
}
