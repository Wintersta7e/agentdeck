import { CH } from '../../shared/ipc-channels'
import { ipcMain } from 'electron'
import path from 'node:path'
import { listSkills } from '../skill-scanner'
import { createLogger } from '../logger'

const log = createLogger('ipc-skills')

export function registerSkillHandlers(): void {
  ipcMain.handle(
    CH.skillsList,
    // `unknown`, not a declared options shape: the payload crosses IPC, so the
    // checks below are what establishes it — including that it arrived at all.
    async (_, opts: unknown) => {
      if (opts !== undefined && (opts === null || typeof opts !== 'object')) {
        throw new Error('skills:list expects an options object')
      }
      const raw = opts as { projectPath?: unknown; includeGlobal?: unknown } | undefined
      const projectPath =
        typeof raw?.projectPath === 'string' && raw.projectPath.length > 0
          ? raw.projectPath
          : undefined

      if (projectPath) {
        // Reject if the normalized path differs from the input — any `..`
        // segment that normalize collapses is a traversal attempt.
        const collapsed = path.posix.normalize(projectPath)
        if (
          !projectPath.startsWith('/') ||
          collapsed !== projectPath ||
          projectPath.includes('..') ||
          projectPath.length > 500
        ) {
          throw new Error('skills:list: invalid projectPath')
        }
      }

      const includeGlobal = raw?.includeGlobal !== false
      log.debug(CH.skillsList, { projectPath, includeGlobal })
      return listSkills({ projectPath, includeGlobal })
    },
  )
}
