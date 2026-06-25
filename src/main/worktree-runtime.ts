import { join } from 'path'
import { app } from 'electron'
import { createLogger } from './logger'
import { createWslGitPort } from './git-port'
import { createWorktreeManager, type WorktreeManager } from './worktree-manager'
import { projectPathById, type AppStore } from './project-store'

const log = createLogger('worktree-runtime')

export async function initializeWorktreeManager(
  store: AppStore,
  wslHome: string | null,
): Promise<WorktreeManager | null> {
  if (!wslHome) {
    log.warn('Worktree manager not created - WSL $HOME unknown')
    return null
  }

  return createWorktreeManager(
    createWslGitPort(),
    (id) => projectPathById(store, id) ?? undefined,
    join(app.getPath('userData'), 'worktree-registry'),
    `${wslHome}/.agentdeck/worktrees`,
  )
}
