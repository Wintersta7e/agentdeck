import { promises as fs, watch, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type {
  Template,
  TemplateFile,
  TemplateDraft,
  TemplateScope,
  TemplateChangeEvent,
} from '../shared/types'
import { createLogger } from './logger'
import { atomicWrite } from './fs-atomic'
import { generateTemplateId } from './template-id'
import { evictOldestFromMap } from './map-utils'
import { createKeyMutex } from './key-mutex'

const log = createLogger('template-store')

export interface TemplateStore {
  listAll: (input?: { projectId?: string }) => Promise<Template[]>
  activateProject: (projectId: string) => Promise<Template[]>
  save: (
    draft: TemplateDraft,
    scope: TemplateScope,
    projectId: string | null,
    baseMtime?: number,
  ) => Promise<Template>
  delete: (ref: { id: string; scope: TemplateScope; projectId: string | null }) => Promise<void>
  incrementUsage: (ref: {
    id: string
    scope: TemplateScope
    projectId: string | null
  }) => Promise<void>
  setPinned: (
    ref: { id: string; scope: TemplateScope; projectId: string | null },
    pinned: boolean,
  ) => Promise<void>
  onChange: (listener: (event: TemplateChangeEvent) => void) => () => void
  onParseError: (listener: (event: { path: string; error: string }) => void) => () => void
  dispose: () => void
}

export type { TemplateChangeEvent }

interface TemplateStoreOptions {
  userRoot: string
  getProjectPath: (projectId: string) => string | null
}

async function readTemplateFile(
  path: string,
  emitParseError?: (e: { path: string; error: string }) => void,
): Promise<TemplateFile | null> {
  try {
    const raw = await fs.readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as TemplateFile
    if (!parsed.id || typeof parsed.name !== 'string') {
      emitParseError?.({ path, error: 'missing id or name' })
      return null
    }
    return parsed
  } catch (err) {
    emitParseError?.({ path, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

async function scanDir(
  dir: string,
  scope: TemplateScope,
  projectId: string | null,
  emitParseError?: (e: { path: string; error: string }) => void,
): Promise<Template[]> {
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const jsonNames = names.filter((n) => n.endsWith('.json'))
  const results = await Promise.all(
    jsonNames.map(async (n): Promise<Template | null> => {
      const path = join(dir, n)
      const [file, stats] = await Promise.all([
        readTemplateFile(path, emitParseError),
        fs.stat(path).catch(() => null),
      ])
      if (!file || !stats) return null
      return { ...file, scope, projectId, path, mtimeMs: stats.mtimeMs }
    }),
  )
  return results.filter((t): t is Template => t !== null)
}

export async function createTemplateStore(opts: TemplateStoreOptions): Promise<TemplateStore> {
  const userRoot = resolve(opts.userRoot)
  await fs.mkdir(userRoot, { recursive: true })

  const parseErrorListeners = new Set<(e: { path: string; error: string }) => void>()
  const emitParseError = (e: { path: string; error: string }): void =>
    parseErrorListeners.forEach((l) => l(e))

  let userPool: Template[] = await scanDir(userRoot, 'user', null, emitParseError)
  const projectPools = new Map<string, Template[]>()

  const changeListeners = new Set<(e: TemplateChangeEvent) => void>()
  const emitChange = (e: TemplateChangeEvent): void => changeListeners.forEach((l) => l(e))

  const serialize = createKeyMutex()

  function findById(
    id: string,
  ): { template: Template; scope: TemplateScope; projectId: string | null } | null {
    const u = userPool.find((t) => t.id === id)
    if (u) return { template: u, scope: 'user', projectId: null }
    for (const [pid, pool] of projectPools) {
      const hit = pool.find((t) => t.id === id)
      if (hit) return { template: hit, scope: 'project', projectId: pid }
    }
    return null
  }

  function resolvePath(scope: TemplateScope, projectId: string | null, id: string): string {
    if (scope === 'user') return join(userRoot, `${id}.json`)
    if (!projectId) throw new Error('project scope requires projectId')
    const projectPath = opts.getProjectPath(projectId)
    if (!projectPath) throw new Error(`project ${projectId} has no path`)
    return join(projectPath, '.agentdeck', 'templates', `${id}.json`)
  }

  // In-process saves share the same mutex, so internal callers must use this
  // unlocked variant to avoid deadlocking the per-id chain.
  async function writeTemplateUnlocked(
    file: TemplateFile,
    scope: TemplateScope,
    projectId: string | null,
    baseMtime?: number,
  ): Promise<Template> {
    const path = resolvePath(scope, projectId, file.id)
    await fs.mkdir(join(path, '..'), { recursive: true })

    const isNew = !findById(file.id)

    if (baseMtime !== undefined) {
      let currentMtime = 0
      try {
        currentMtime = (await fs.stat(path)).mtimeMs
      } catch {
        /* fresh file */
      }
      if (currentMtime > baseMtime + 0.001) {
        const err = new Error('template changed on disk') as Error & { code: string }
        err.code = 'E_TEMPLATE_STALE'
        throw err
      }
    }
    const mtimeMs = await atomicWrite(path, JSON.stringify(file, null, 2))
    const loaded: Template = { ...file, scope, projectId, path, mtimeMs }
    if (scope === 'user') {
      userPool = [loaded, ...userPool.filter((t) => t.id !== file.id)]
    } else if (projectId) {
      const pool = projectPools.get(projectId) ?? []
      projectPools.set(projectId, [loaded, ...pool.filter((t) => t.id !== file.id)])
    }
    emitChange({ kind: isNew ? 'add' : 'update', scope, projectId, template: loaded })
    return loaded
  }

  function diffAndEmit(
    prev: Template[],
    next: Template[],
    scope: TemplateScope,
    projectId: string | null,
  ): void {
    const prevMap = new Map(prev.map((t) => [t.id, t]))
    const nextMap = new Map(next.map((t) => [t.id, t]))
    for (const [id, t] of nextMap) {
      const old = prevMap.get(id)
      if (!old) {
        emitChange({ kind: 'add', scope, projectId, template: t })
      } else if (old.mtimeMs !== t.mtimeMs) {
        emitChange({ kind: 'update', scope, projectId, template: t })
      }
    }
    for (const [id] of prevMap) {
      if (!nextMap.has(id)) {
        emitChange({ kind: 'delete', scope, projectId, id })
      }
    }
  }

  function setupWatcher(dir: string, rescan: () => Promise<void>): () => void {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let watcher: ReturnType<typeof watch> | null = null
    let disposed = false

    const trigger = (): void => {
      if (disposed) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        void rescan()
      }, 200)
      debounceTimer.unref?.()
    }

    const startPolling = (): void => {
      if (disposed || pollTimer) return
      if (watcher) {
        try {
          watcher.close()
        } catch {
          /* noop */
        }
        watcher = null
      }
      pollTimer = setInterval(() => {
        void rescan()
      }, 10_000)
      pollTimer.unref?.()
    }

    // Most projects don't have a per-project template dir; fs.watch throws
    // ENOENT immediately on missing paths and the 10s polling fallback then
    // re-scans a still-missing dir forever. Skip both when the dir is absent
    // — new templates appear the next time activateProject runs for the
    // project (i.e. on switch-away-and-back), which is the only meaningful
    // event for a feature that has to be opted into via file creation.
    if (!existsSync(dir)) {
      return () => {
        disposed = true
      }
    }

    try {
      watcher = watch(dir, { persistent: false }, () => {
        trigger()
      })
      watcher.on('error', (err) => {
        log.warn('template-store watch emitted error; falling back to 10s poll', {
          dir,
          err: String(err),
        })
        startPolling()
      })
      // Close the scan-before-watch gap: if a file changed between the initial
      // scan and watcher registration, this rescan catches it.
      trigger()
    } catch (err) {
      log.warn('fs.watch failed for template dir; falling back to 10s poll', {
        dir,
        err: String(err),
      })
      startPolling()
    }

    return () => {
      disposed = true
      if (watcher) {
        try {
          watcher.close()
        } catch {
          /* noop */
        }
        watcher = null
      }
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
    }
  }

  const rescanUser = async (): Promise<void> => {
    const next = await scanDir(userRoot, 'user', null, emitParseError)
    diffAndEmit(userPool, next, 'user', null)
    userPool = next
  }

  const userWatcherOff = setupWatcher(userRoot, rescanUser)
  // LRU of per-project filesystem watchers. activateProject is called whenever
  // the active project changes; without a cap, every project the user has
  // ever opened in a session would keep an fs.watch handle (or 10s poll
  // fallback) alive until app shutdown. We evict the least-recently-activated
  // watcher when MAX_PROJECT_WATCHERS is exceeded; the pool of cached
  // templates for an evicted project stays put so listAll stays correct.
  const MAX_PROJECT_WATCHERS = 8
  const projectWatchers = new Map<string, () => void>()

  return {
    listAll: async (input) => {
      const merged: Template[] = [...userPool]
      if (input?.projectId) {
        const pool = projectPools.get(input.projectId) ?? []
        merged.push(...pool)
      }
      return merged
    },

    activateProject: async (projectId) => {
      const pPath = opts.getProjectPath(projectId)
      if (!pPath) return []

      // Teardown existing watcher for this projectId before re-scanning so
      // we don't double-register and so re-insertion below moves it to the
      // most-recent slot in the LRU.
      const existingOff = projectWatchers.get(projectId)
      if (existingOff) {
        existingOff()
        projectWatchers.delete(projectId)
      }

      const dir = join(pPath, '.agentdeck', 'templates')
      const pool = await scanDir(dir, 'project', projectId, emitParseError)
      projectPools.set(projectId, pool)

      const rescan = async (): Promise<void> => {
        const next = await scanDir(dir, 'project', projectId, emitParseError)
        diffAndEmit(projectPools.get(projectId) ?? [], next, 'project', projectId)
        projectPools.set(projectId, next)
      }
      projectWatchers.set(projectId, setupWatcher(dir, rescan))
      evictOldestFromMap(projectWatchers, MAX_PROJECT_WATCHERS, (_id, off) => off())

      return pool
    },

    save: async (draft, scope, projectId, baseMtime) => {
      const id = draft.id ?? generateTemplateId()
      // Cross-scope collision check runs INSIDE the per-id serialize so two
      // concurrent same-id cross-scope saves can't both pass the findById
      // check and race to write — lookup, file-build, and write share the
      // same critical section.
      return serialize(id, async () => {
        const existing = findById(id)
        if (existing && (existing.scope !== scope || existing.projectId !== projectId)) {
          const err = new Error(
            `template id ${id} already exists in ${existing.scope} scope`,
          ) as Error & { code: string }
          err.code = 'E_TEMPLATE_ID_EXISTS'
          throw err
        }
        const file: TemplateFile = {
          id,
          name: draft.name,
          description: draft.description,
          content: draft.content,
          ...(draft.category !== undefined ? { category: draft.category } : {}),
          usageCount: existing?.template.usageCount ?? 0,
          lastUsedAt: existing?.template.lastUsedAt ?? 0,
          pinned: existing?.template.pinned ?? false,
        }
        return writeTemplateUnlocked(file, scope, projectId, baseMtime)
      })
    },

    delete: async (ref) => {
      await serialize(ref.id, async () => {
        const path = resolvePath(ref.scope, ref.projectId, ref.id)
        await fs.unlink(path).catch(() => undefined)
        if (ref.scope === 'user') {
          userPool = userPool.filter((t) => t.id !== ref.id)
        } else if (ref.projectId) {
          const pool = projectPools.get(ref.projectId) ?? []
          projectPools.set(
            ref.projectId,
            pool.filter((t) => t.id !== ref.id),
          )
        }
        emitChange({ kind: 'delete', scope: ref.scope, projectId: ref.projectId, id: ref.id })
      })
    },

    incrementUsage: async (ref) => {
      await serialize(ref.id, async () => {
        const hit = findById(ref.id)
        if (!hit) return
        const file: TemplateFile = {
          id: hit.template.id,
          name: hit.template.name,
          description: hit.template.description,
          content: hit.template.content,
          ...(hit.template.category !== undefined ? { category: hit.template.category } : {}),
          usageCount: hit.template.usageCount + 1,
          lastUsedAt: Date.now(),
          pinned: hit.template.pinned,
        }
        await writeTemplateUnlocked(file, hit.scope, hit.projectId)
      })
    },

    setPinned: async (ref, pinned) => {
      await serialize(ref.id, async () => {
        const hit = findById(ref.id)
        if (!hit) return
        const file: TemplateFile = {
          id: hit.template.id,
          name: hit.template.name,
          description: hit.template.description,
          content: hit.template.content,
          ...(hit.template.category !== undefined ? { category: hit.template.category } : {}),
          usageCount: hit.template.usageCount,
          lastUsedAt: hit.template.lastUsedAt,
          pinned,
        }
        await writeTemplateUnlocked(file, hit.scope, hit.projectId)
      })
    },

    onChange: (listener) => {
      changeListeners.add(listener)
      return () => {
        changeListeners.delete(listener)
      }
    },

    onParseError: (listener) => {
      parseErrorListeners.add(listener)
      return () => {
        parseErrorListeners.delete(listener)
      }
    },

    dispose: () => {
      userWatcherOff()
      for (const off of projectWatchers.values()) off()
      projectWatchers.clear()
      changeListeners.clear()
      parseErrorListeners.clear()
    },
  }
}
