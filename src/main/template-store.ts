import { promises as fs, watch } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { Template, TemplateFile, TemplateDraft, TemplateScope } from '../shared/types'
import { createLogger } from './logger'

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

export type TemplateChangeEvent =
  | { kind: 'add'; scope: TemplateScope; projectId: string | null; template: Template }
  | { kind: 'update'; scope: TemplateScope; projectId: string | null; template: Template }
  | { kind: 'delete'; scope: TemplateScope; projectId: string | null; id: string }

interface TemplateStoreOptions {
  userRoot: string
  getProjectPath: (projectId: string) => string | null
}

function createMutex(): <T>(key: string, fn: () => Promise<T>) => Promise<T> {
  const chains = new Map<string, Promise<unknown>>()
  return function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = chains.get(key) ?? Promise.resolve()
    const next = prev.then(
      () => fn(),
      () => fn(),
    )
    chains.set(key, next as Promise<unknown>)
    return next.finally(() => {
      if (chains.get(key) === next) chains.delete(key)
    }) as Promise<T>
  }
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
  const out: Template[] = []
  for (const n of names) {
    if (!n.endsWith('.json')) continue
    const path = join(dir, n)
    const file = await readTemplateFile(path, emitParseError)
    if (!file) continue
    const s = await fs.stat(path)
    out.push({ ...file, scope, projectId, path, mtimeMs: s.mtimeMs })
  }
  return out
}

async function atomicWrite(path: string, data: string): Promise<number> {
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`
  await fs.writeFile(tmp, data, 'utf-8')
  await fs.rename(tmp, path)
  const s = await fs.stat(path)
  return s.mtimeMs
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

  const serialize = createMutex()

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

  // PREREQ B4: Unlocked variant — callers that already hold the lock use this.
  async function writeTemplateUnlocked(
    file: TemplateFile,
    scope: TemplateScope,
    projectId: string | null,
    baseMtime?: number,
  ): Promise<Template> {
    const path = resolvePath(scope, projectId, file.id)
    await fs.mkdir(join(path, '..'), { recursive: true })

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
    emitChange({ kind: 'update', scope, projectId, template: loaded })
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

  // KNOWN LIMITATION (v6.1.1 deferred — Section 4 of v6.1.0 codex review):
  // There is a scan-before-watch window: files written to `dir` between the
  // initial scan (in activateProject / bootstrap) and the watch subscription
  // being fully armed are silently missed. Additionally, the catch-branch
  // below swaps fs.watch for a 10s polling interval — the watcher's own
  // runtime 'error' event (logged above) does NOT fall back to polling, so a
  // watcher that fails mid-life will stop emitting change events until the
  // renderer triggers a manual rescan (activateProject / bootstrap).
  // Proper fix requires an event-replay queue during the scan and a
  // runtime-error fallback to polling — scoped too large for v6.1.0.
  function setupWatcher(dir: string, rescan: () => Promise<void>): () => void {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const trigger = (): void => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void rescan()
      }, 200)
    }
    try {
      const w = watch(dir, { persistent: false }, () => {
        trigger()
      })
      w.on('error', (err) => {
        log.warn('template-store watch emitted error', { dir, err: String(err) })
      })
      return () => {
        try {
          w.close()
        } catch {
          /* noop */
        }
        if (debounceTimer) clearTimeout(debounceTimer)
      }
    } catch (err) {
      log.warn('fs.watch failed for template dir; falling back to 10s poll', {
        dir,
        err: String(err),
      })
      const id = setInterval(() => {
        void rescan()
      }, 10_000)
      return () => {
        clearInterval(id)
        if (debounceTimer) clearTimeout(debounceTimer)
      }
    }
  }

  const rescanUser = async (): Promise<void> => {
    const next = await scanDir(userRoot, 'user', null, emitParseError)
    diffAndEmit(userPool, next, 'user', null)
    userPool = next
  }

  const userWatcherOff = setupWatcher(userRoot, rescanUser)
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

      // Teardown existing watcher for this projectId before re-scanning.
      const existingOff = projectWatchers.get(projectId)
      if (existingOff) existingOff()

      const dir = join(pPath, '.agentdeck', 'templates')
      const pool = await scanDir(dir, 'project', projectId, emitParseError)
      projectPools.set(projectId, pool)

      const rescan = async (): Promise<void> => {
        const next = await scanDir(dir, 'project', projectId, emitParseError)
        diffAndEmit(projectPools.get(projectId) ?? [], next, 'project', projectId)
        projectPools.set(projectId, next)
      }
      projectWatchers.set(projectId, setupWatcher(dir, rescan))

      return pool
    },

    save: async (draft, scope, projectId, baseMtime) => {
      const id = draft.id ?? `tmpl-${randomBytes(6).toString('hex')}`
      // PREREQ H6 (refined): cross-scope collision check runs INSIDE the
      // per-id serialize so two concurrent same-id cross-scope saves can't
      // both pass the findById check and race to write. The lookup, the
      // file-build, and the atomic write all share the same critical section.
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

    // PREREQ B4: calls writeTemplateUnlocked from inside serialize.
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

    // PREREQ B4: calls writeTemplateUnlocked from inside serialize.
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
