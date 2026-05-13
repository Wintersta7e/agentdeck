import { CH } from '../../shared/ipc-channels'
import { ipcMain } from 'electron'
import { SAFE_ID_RE } from '../validation'
import { getGitStatus } from '../git-status'
import { createReviewTracker } from '../review-tracker'

const reviewTracker = createReviewTracker()

export { reviewTracker }

export function registerHomeHandlers(getProjectPath: (projectId: string) => string | null): void {
  ipcMain.handle(CH.projectsGitStatus, async (_, projectId: string) => {
    if (typeof projectId !== 'string' || !SAFE_ID_RE.test(projectId)) {
      throw new Error('Invalid projectId')
    }
    const path = getProjectPath(projectId)
    if (!path) return null
    return getGitStatus(path)
  })

  ipcMain.handle(CH.projectsPendingReviews, (_, projectId: string) => {
    if (typeof projectId !== 'string' || !SAFE_ID_RE.test(projectId)) {
      throw new Error('Invalid projectId')
    }
    return reviewTracker.getReviews(projectId)
  })

  ipcMain.handle(CH.projectsDismissReview, (_, reviewId: string) => {
    if (typeof reviewId !== 'string' || !SAFE_ID_RE.test(reviewId)) {
      throw new Error('Invalid reviewId')
    }
    reviewTracker.dismissReview(reviewId)
  })
}
