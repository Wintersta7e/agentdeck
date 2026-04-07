import { ipcMain, app } from 'electron'
import { join } from 'node:path'
import { SAFE_ID_RE } from '../validation'
import { getGitStatus } from '../git-status'
import { createReviewTracker } from '../review-tracker'
import { createCostHistory } from '../cost-history'

const reviewTracker = createReviewTracker()
const costHistory = createCostHistory(join(app.getPath('userData'), 'cost-history.json'))

export { reviewTracker, costHistory }

export function registerHomeHandlers(getProjectPath: (projectId: string) => string | null): void {
  ipcMain.handle('projects:gitStatus', async (_, projectId: string) => {
    if (typeof projectId !== 'string' || !SAFE_ID_RE.test(projectId)) {
      throw new Error('Invalid projectId')
    }
    const path = getProjectPath(projectId)
    if (!path) return null
    return getGitStatus(path)
  })

  ipcMain.handle('projects:pendingReviews', (_, projectId: string) => {
    if (typeof projectId !== 'string' || !SAFE_ID_RE.test(projectId)) {
      throw new Error('Invalid projectId')
    }
    return reviewTracker.getReviews(projectId)
  })

  ipcMain.handle('projects:dismissReview', (_, reviewId: string) => {
    if (typeof reviewId !== 'string' || !SAFE_ID_RE.test(reviewId)) {
      throw new Error('Invalid reviewId')
    }
    reviewTracker.dismissReview(reviewId)
  })

  ipcMain.handle('cost:getHistory', (_, days: number) => {
    if (typeof days !== 'number' || days < 1 || days > 365) {
      throw new Error('Invalid days parameter')
    }
    return costHistory.getHistory(days)
  })

  ipcMain.handle('cost:getBudget', () => {
    return costHistory.getBudget()
  })

  ipcMain.handle('cost:setBudget', (_, amount: number | null) => {
    if (amount !== null && (typeof amount !== 'number' || amount < 0)) {
      throw new Error('Invalid budget amount')
    }
    costHistory.setBudget(amount)
  })
}
