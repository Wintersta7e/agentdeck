import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'
import type { Role, Template, TemplateDraft, TemplateScope } from '../../../shared/types'

/**
 * Shape of a single `templates:change` event emitted by the main-process
 * TemplateStore. Kept as a local type because the event channel currently
 * carries an unknown payload over the preload bridge.
 */
type TemplateChangeEvent =
  | { kind: 'add'; scope: TemplateScope; projectId: string | null; template: Template }
  | { kind: 'update'; scope: TemplateScope; projectId: string | null; template: Template }
  | { kind: 'delete'; scope: TemplateScope; projectId: string | null; id: string }

interface TemplateRef {
  id: string
  scope: TemplateScope
  projectId: string | null
}

export interface TemplatesSlice {
  /**
   * Derived: merge of `userTemplates` + active project pool from
   * `projectTemplates`. Kept for backward-compat with legacy consumers until
   * they migrate to `useTemplates()`. Do NOT set directly — use
   * `bootstrapTemplates` / `activateProjectTemplates` or the mutator actions.
   */
  templates: Template[]

  userTemplates: Template[]
  projectTemplates: Record<string, Template[]>
  activeProjectTemplatesLoaded: string | null

  // Bootstrap + activation
  bootstrapTemplates: () => Promise<void>
  activateProjectTemplates: (projectId: string | null) => Promise<void>

  // Mutations (go through IPC; state is updated via onChange events)
  saveTemplate: (
    draft: TemplateDraft,
    scope: TemplateScope,
    projectId: string | null,
    baseMtime?: number,
  ) => Promise<Template>
  deleteTemplate: (ref: TemplateRef) => Promise<void>
  incrementUsage: (ref: TemplateRef) => Promise<void>
  setPinned: (ref: TemplateRef, pinned: boolean) => Promise<void>

  /**
   * Legacy compat — remains as a plain setter so any straggling caller keeps
   * working. The new slice's own mutation actions do NOT use this; removed
   * in the follow-up task that migrates consumers.
   */
  setTemplates: (templates: Template[]) => void

  roles: Role[]
  setRoles: (roles: Role[]) => void
}

/**
 * Merge user-scope + active-project-scope templates into a single list with
 * the same dedup + sort policy used by `getTemplatesForActiveProject`. Kept
 * here (exported) so slice mutators can re-derive the legacy `templates`
 * field in one place.
 *
 * Sort order: pinned first, then lastUsedAt desc, then name asc.
 */
export function mergeUserAndProject(
  userTemplates: Template[],
  projectTemplates: Record<string, Template[]>,
  activeProjectId: string | null,
): Template[] {
  const projectPool = activeProjectId ? (projectTemplates[activeProjectId] ?? []) : []
  const byId = new Map<string, Template>()
  for (const t of userTemplates) byId.set(t.id, t)
  for (const t of projectPool) byId.set(t.id, t) // project wins on collision
  return Array.from(byId.values()).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.lastUsedAt !== b.lastUsedAt) return b.lastUsedAt - a.lastUsedAt
    return a.name.localeCompare(b.name)
  })
}

// ── Module-level subscription handles ──────────────────────────────
// We keep these outside the store so they don't pollute the serializable
// state shape. `bootstrapTemplates` is idempotent: calling it twice tears
// down the previous subscriptions first.
let templatesUnsub: (() => void) | null = null
let templatesParseErrorUnsub: (() => void) | null = null

export const createTemplatesSlice: StateCreator<AppState, [], [], TemplatesSlice> = (set, get) => {
  const recompute = (): void => {
    const { userTemplates, projectTemplates, activeProjectTemplatesLoaded } = get()
    set({
      templates: mergeUserAndProject(userTemplates, projectTemplates, activeProjectTemplatesLoaded),
    })
  }

  const applyChangeEvent = (event: TemplateChangeEvent): void => {
    const { userTemplates, projectTemplates } = get()
    if (event.scope === 'user') {
      if (event.kind === 'delete') {
        set({ userTemplates: userTemplates.filter((t) => t.id !== event.id) })
      } else {
        const tpl = event.template
        const existing = userTemplates.findIndex((t) => t.id === tpl.id)
        const next =
          existing >= 0
            ? userTemplates.map((t, i) => (i === existing ? tpl : t))
            : [...userTemplates, tpl]
        set({ userTemplates: next })
      }
    } else {
      const projectId = event.projectId
      if (projectId === null) return // defensive: project-scope events always carry a projectId
      const pool = projectTemplates[projectId] ?? []
      let nextPool: Template[]
      if (event.kind === 'delete') {
        nextPool = pool.filter((t) => t.id !== event.id)
      } else {
        const tpl = event.template
        const existing = pool.findIndex((t) => t.id === tpl.id)
        nextPool = existing >= 0 ? pool.map((t, i) => (i === existing ? tpl : t)) : [...pool, tpl]
      }
      set({ projectTemplates: { ...projectTemplates, [projectId]: nextPool } })
    }
    recompute()
  }

  return {
    templates: [],
    userTemplates: [],
    projectTemplates: {},
    activeProjectTemplatesLoaded: null,

    bootstrapTemplates: async () => {
      // Idempotent: tear down any previous subscriptions first.
      if (templatesUnsub) {
        templatesUnsub()
        templatesUnsub = null
      }
      if (templatesParseErrorUnsub) {
        templatesParseErrorUnsub()
        templatesParseErrorUnsub = null
      }

      try {
        const all = await window.agentDeck.templates.listAll()
        // `listAll()` with no input returns user-scope only (new store) or
        // all legacy templates (legacy mode — all coerced to `user` scope).
        // Project-scope pools are loaded on demand via `activateProject`.
        const userTemplates = all.filter((t) => t.scope === 'user')
        set({
          userTemplates,
          projectTemplates: {},
          activeProjectTemplatesLoaded: null,
        })
        recompute()
      } catch (err) {
        window.agentDeck.log.send('warn', 'templates', 'bootstrap listAll failed', {
          err: String(err),
        })
      }

      templatesUnsub = window.agentDeck.templates.onChange((raw: unknown) => {
        // Defensive: the preload types this as `unknown`. Narrow before use.
        if (!raw || typeof raw !== 'object') return
        const event = raw as TemplateChangeEvent
        if (event.kind !== 'add' && event.kind !== 'update' && event.kind !== 'delete') {
          return
        }
        applyChangeEvent(event)
      })

      templatesParseErrorUnsub = window.agentDeck.templates.onParseError((e) => {
        window.agentDeck.log.send('warn', 'templates', 'parse error', {
          path: e.path,
          error: e.error,
        })
      })
    },

    activateProjectTemplates: async (projectId) => {
      if (projectId === null) {
        set({ activeProjectTemplatesLoaded: null })
        recompute()
        return
      }
      if (get().activeProjectTemplatesLoaded === projectId) {
        return // already loaded
      }
      try {
        const pool = await window.agentDeck.templates.activateProject(projectId)
        set({
          projectTemplates: { ...get().projectTemplates, [projectId]: pool },
          activeProjectTemplatesLoaded: projectId,
        })
        recompute()
      } catch (err) {
        window.agentDeck.log.send('warn', 'templates', 'activateProject failed', {
          projectId,
          err: String(err),
        })
      }
    },

    saveTemplate: async (draft, scope, projectId, baseMtime) => {
      // No optimistic update — the onChange event supplies authoritative data.
      // Re-throw so callers (TemplateEditor) can surface E_TEMPLATE_STALE etc.
      return window.agentDeck.templates.save(draft, scope, projectId, baseMtime)
    },

    deleteTemplate: async (ref) => {
      await window.agentDeck.templates.delete(ref)
    },

    incrementUsage: async (ref) => {
      await window.agentDeck.templates.incrementUsage(ref)
    },

    setPinned: async (ref, pinned) => {
      await window.agentDeck.templates.setPinned(ref, pinned)
    },

    setTemplates: (templates) => set({ templates }),

    roles: [],
    setRoles: (roles) => set({ roles }),
  }
}
