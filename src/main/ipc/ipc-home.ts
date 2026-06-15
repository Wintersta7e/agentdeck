import { CH } from '../../shared/ipc-channels'
import { ipcMain } from 'electron'
import { validateId } from '../validation'
import { getGitStatus } from '../git-status'
import type { ReviewTracker } from '../review-tracker'

export function registerHomeHandlers(
  getProjectPath: (projectId: string) => string | null,
  reviewTracker: ReviewTracker,
): void {
  ipcMain.handle(CH.projectsGitStatus, async (_, projectId: string) => {
    validateId(projectId, 'projectId')
    const path = getProjectPath(projectId)
    if (!path) return null
    return getGitStatus(path)
  })

  ipcMain.handle(CH.projectsPendingReviews, (_, projectId: string) => {
    validateId(projectId, 'projectId')
    return reviewTracker.getReviews(projectId)
  })

  ipcMain.handle(CH.projectsDismissReview, (_, reviewId: string) => {
    validateId(reviewId, 'reviewId')
    reviewTracker.dismissReview(reviewId)
  })
}
