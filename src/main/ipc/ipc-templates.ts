import { ipcMain, type BrowserWindow } from 'electron'
import type {
  Template,
  TemplateCategory,
  TemplateDraft,
  TemplateFile,
  TemplateScope,
} from '../../shared/types'
import type { TemplateStore, TemplateChangeEvent } from '../template-store'
import type { LegacyStoreAdapter } from '../template-legacy-store'
import { SAFE_ID_RE } from '../validation'
import { createLogger } from '../logger'
import { generateTemplateId } from '../template-id'

const log = createLogger('ipc-templates')

const SCOPES: TemplateScope[] = ['user', 'project']
const CATEGORIES = new Set<TemplateCategory>([
  'Orient',
  'Review',
  'Fix',
  'Test',
  'Refactor',
  'Debug',
  'Docs',
  'Git',
])

const MAX_ID_LEN = 128
const MAX_PROJECT_ID_LEN = 128
const MAX_NAME_LEN = 256
const MAX_DESC_LEN = 1024
const MAX_CONTENT_LEN = 100_000

export interface TemplateHandlerContext {
  /** The file-backed template store. */
  store: TemplateStore
  /** Legacy flat-store adapter used while migration is pending or has failed. */
  legacy: LegacyStoreAdapter
  /** True once `runTemplateMigration` has completed successfully. */
  migrationComplete: () => boolean
  /** Lookup for project existence, used to validate `projectId` refs. */
  getProjectExists: (projectId: string) => boolean
}

interface TemplateRef {
  id: string
  scope: TemplateScope
  projectId: string | null
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function validateDraft(input: unknown): asserts input is TemplateDraft {
  if (!isPlainObject(input)) throw new Error('draft must be an object')
  const raw = input
  if (raw.id !== undefined && (typeof raw.id !== 'string' || !SAFE_ID_RE.test(raw.id))) {
    throw new Error('draft.id must be a valid identifier')
  }
  if (raw.id !== undefined && typeof raw.id === 'string' && raw.id.length > MAX_ID_LEN) {
    throw new Error(`draft.id too long (max ${String(MAX_ID_LEN)})`)
  }
  if (typeof raw.name !== 'string' || raw.name.length === 0) {
    throw new Error('draft.name is required')
  }
  if (raw.name.length > MAX_NAME_LEN) {
    throw new Error(`draft.name too long (max ${String(MAX_NAME_LEN)})`)
  }
  if (typeof raw.description !== 'string') {
    throw new Error('draft.description must be a string')
  }
  if (raw.description.length > MAX_DESC_LEN) {
    throw new Error(`draft.description too long (max ${String(MAX_DESC_LEN)})`)
  }
  if (typeof raw.content !== 'string') {
    throw new Error('draft.content must be a string')
  }
  if (raw.content.length > MAX_CONTENT_LEN) {
    throw new Error(`draft.content too long (max ${String(MAX_CONTENT_LEN)})`)
  }
  if (raw.category !== undefined) {
    if (typeof raw.category !== 'string') {
      throw new Error('draft.category must be a string')
    }
    if (!CATEGORIES.has(raw.category as TemplateCategory)) {
      throw new Error('draft.category is not a valid TemplateCategory')
    }
  }
}

function validateScopeAndProject(
  scope: unknown,
  projectId: unknown,
  ctx: TemplateHandlerContext,
): asserts scope is TemplateScope {
  if (!SCOPES.includes(scope as TemplateScope)) {
    throw new Error('invalid scope')
  }
  if (scope === 'project') {
    if (typeof projectId !== 'string' || !SAFE_ID_RE.test(projectId)) {
      throw new Error('projectId required for project scope')
    }
    if (projectId.length > MAX_PROJECT_ID_LEN) {
      throw new Error(`projectId too long (max ${String(MAX_PROJECT_ID_LEN)})`)
    }
    if (!ctx.getProjectExists(projectId)) {
      throw new Error('unknown projectId')
    }
  } else if (projectId !== null && projectId !== undefined) {
    throw new Error('user scope requires projectId=null')
  }
}

function validateRef(input: unknown, ctx: TemplateHandlerContext): TemplateRef {
  if (!isPlainObject(input)) throw new Error('ref must be an object')
  const raw = input
  if (typeof raw.id !== 'string' || !SAFE_ID_RE.test(raw.id)) {
    throw new Error('ref.id must be a valid identifier')
  }
  if (raw.id.length > MAX_ID_LEN) {
    throw new Error(`ref.id too long (max ${String(MAX_ID_LEN)})`)
  }
  const scope = raw.scope
  const projectId = (raw.projectId ?? null) as string | null
  validateScopeAndProject(scope, projectId, ctx)
  return {
    id: raw.id,
    scope: scope as TemplateScope,
    projectId: scope === 'project' ? (projectId as string) : null,
  }
}

/**
 * Register the v6.1.0 template IPC surface:
 *
 *   templates:listAll
 *   templates:activateProject
 *   templates:save
 *   templates:delete
 *   templates:incrementUsage
 *   templates:setPinned
 *
 * While `migrationComplete()` returns false, save/delete/etc. fall back to
 * the legacy flat electron-store via `LegacyStoreAdapter` so users never lose
 * access to their templates during migration.
 */
export function registerTemplateIpc(ctx: TemplateHandlerContext): void {
  ipcMain.handle(
    'templates:listAll',
    async (_event, input?: { projectId?: string } | undefined): Promise<Template[]> => {
      // Validate input BEFORE the migration-complete branch so malformed
      // payloads are rejected uniformly regardless of current migration state.
      if (input !== undefined && !isPlainObject(input)) {
        throw new Error('templates:listAll input must be an object or undefined')
      }
      const projectId = input?.projectId
      if (projectId !== undefined) {
        if (typeof projectId !== 'string' || !SAFE_ID_RE.test(projectId)) {
          throw new Error('templates:listAll — projectId must be a valid identifier')
        }
        if (projectId.length > MAX_PROJECT_ID_LEN) {
          throw new Error(
            `templates:listAll — projectId too long (max ${String(MAX_PROJECT_ID_LEN)})`,
          )
        }
      }
      if (!ctx.migrationComplete()) {
        return ctx.legacy.listAll()
      }
      return ctx.store.listAll(projectId !== undefined ? { projectId } : undefined)
    },
  )

  ipcMain.handle(
    'templates:activateProject',
    async (_event, projectId: unknown): Promise<Template[]> => {
      if (typeof projectId !== 'string' || !SAFE_ID_RE.test(projectId)) {
        throw new Error('templates:activateProject — projectId must be a valid identifier')
      }
      if (projectId.length > MAX_PROJECT_ID_LEN) {
        throw new Error(
          `templates:activateProject — projectId too long (max ${String(MAX_PROJECT_ID_LEN)})`,
        )
      }
      if (!ctx.getProjectExists(projectId)) {
        throw new Error('unknown projectId')
      }
      if (!ctx.migrationComplete()) {
        // Nothing to activate in legacy mode — all legacy templates are user-scope.
        return []
      }
      return ctx.store.activateProject(projectId)
    },
  )

  ipcMain.handle(
    'templates:save',
    async (
      _event,
      draft: unknown,
      scope: unknown,
      projectId: unknown,
      baseMtime?: unknown,
    ): Promise<Template> => {
      validateDraft(draft)
      validateScopeAndProject(scope, projectId, ctx)
      if (baseMtime !== undefined) {
        if (typeof baseMtime !== 'number') {
          throw new Error('baseMtime must be a number')
        }
        // Reject NaN, Infinity, negatives, and impossibly large values. The
        // prior check only blocked non-number types, so NaN/Infinity slipped
        // through and would corrupt the stale-write comparison in
        // writeTemplateUnlocked.
        if (!Number.isFinite(baseMtime) || baseMtime < 0 || baseMtime > Number.MAX_SAFE_INTEGER) {
          throw new Error('baseMtime must be a finite non-negative number')
        }
      }
      const normalizedProjectId = scope === 'project' ? (projectId as string) : null

      if (!ctx.migrationComplete()) {
        const d = draft as TemplateDraft
        const file: TemplateFile = {
          id: d.id ?? generateTemplateId(),
          name: d.name,
          description: d.description,
          content: d.content,
          ...(d.category !== undefined ? { category: d.category } : {}),
          usageCount: 0,
          lastUsedAt: 0,
          pinned: false,
        }
        return ctx.legacy.save(file)
      }

      return ctx.store.save(
        draft as TemplateDraft,
        scope as TemplateScope,
        normalizedProjectId,
        baseMtime as number | undefined,
      )
    },
  )

  ipcMain.handle('templates:delete', async (_event, refInput: unknown): Promise<void> => {
    const ref = validateRef(refInput, ctx)
    if (!ctx.migrationComplete()) {
      await ctx.legacy.delete(ref.id)
      return
    }
    await ctx.store.delete(ref)
  })

  ipcMain.handle('templates:incrementUsage', async (_event, refInput: unknown): Promise<void> => {
    const ref = validateRef(refInput, ctx)
    if (!ctx.migrationComplete()) {
      await ctx.legacy.incrementUsage(ref.id)
      return
    }
    await ctx.store.incrementUsage(ref)
  })

  ipcMain.handle(
    'templates:setPinned',
    async (_event, refInput: unknown, pinned: unknown): Promise<void> => {
      const ref = validateRef(refInput, ctx)
      if (typeof pinned !== 'boolean') {
        throw new Error('pinned must be a boolean')
      }
      if (!ctx.migrationComplete()) {
        await ctx.legacy.setPinned(ref.id, pinned)
        return
      }
      await ctx.store.setPinned(ref, pinned)
    },
  )

  log.info('template IPC registered')
}

/**
 * PREREQ B5: compat shim for the legacy `store:getTemplates` channel, moved
 * out of `project-store.ts` to avoid double-registration at boot. Removed in
 * v6.2.0 alongside the legacy-fallback path.
 */
export function registerLegacyTemplateIpc(ctx: {
  store: TemplateStore
  legacy: LegacyStoreAdapter
  migrationComplete: () => boolean
}): void {
  ipcMain.handle('store:getTemplates', async (): Promise<Template[]> => {
    if (!ctx.migrationComplete()) {
      return ctx.legacy.listAll()
    }
    return ctx.store.listAll()
  })
}

/** Forward `onChange` and `onParseError` events from the store to the renderer. */
export function wireTemplateWindowEvents(
  store: TemplateStore,
  getWindow: () => BrowserWindow | null,
): () => void {
  const offChange = store.onChange((event: TemplateChangeEvent): void => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return
    win.webContents.send('templates:change', event)
  })
  const offParseError = store.onParseError((event): void => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return
    win.webContents.send('templates:parseError', event)
  })
  return () => {
    offChange()
    offParseError()
  }
}
