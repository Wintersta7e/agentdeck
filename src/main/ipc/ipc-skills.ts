import { ipcMain } from 'electron'
import { listSkills } from '../skill-scanner'
import { createLogger } from '../logger'

const log = createLogger('ipc-skills')

export function registerSkillHandlers(): void {
  ipcMain.handle(
    'skills:list',
    async (_, opts: { projectPath?: string; includeGlobal?: boolean }) => {
      if (opts && typeof opts !== 'object') {
        throw new Error('skills:list expects an options object')
      }
      const projectPath =
        typeof opts?.projectPath === 'string' && opts.projectPath.length > 0
          ? opts.projectPath
          : undefined
      const includeGlobal = opts?.includeGlobal !== false
      log.debug('skills:list', { projectPath, includeGlobal })
      return listSkills({ projectPath, includeGlobal })
    },
  )
}
