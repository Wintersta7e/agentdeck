import { CH } from '../../shared/ipc-channels'
import { ipcRenderer } from 'electron'
import type { AgentDeckBridge } from '../../shared/bridge'
import type { ReviewItem } from '../../shared/types'
import { onIpc } from './events'

type WorkspaceBridge = Pick<AgentDeckBridge, 'worktree' | 'home' | 'usage' | 'sessions' | 'limits'>

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
      onReviewsUpdated: (cb) => onIpc<ReviewItem[]>(CH.homeReviewsUpdated, cb),
    },
    usage: {
      recordSession: (rec) => ipcRenderer.invoke(CH.usageRecordSession, rec),
      getHistory: (days) => ipcRenderer.invoke(CH.usageGetHistory, days),
    },
    sessions: {
      getHistory: (days) => ipcRenderer.invoke(CH.sessionsGetHistory, days),
    },
    limits: {
      getCodex: () => ipcRenderer.invoke(CH.limitsGetCodex),
    },
  }
}
