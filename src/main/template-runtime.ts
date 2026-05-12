import { createLogger } from './logger'
import type { AppStore } from './project-store'
import { createLegacyStoreAdapter } from './template-legacy-store'
import { runTemplateMigration } from './template-migration'
import { createTemplateStore, type TemplateStore } from './template-store'
import { seedTemplateData } from './store-seeds'
import { registerLegacyTemplateIpc, registerTemplateIpc } from './ipc'

const log = createLogger('template-runtime')

type MigrationStore = {
  has: (key: string) => boolean
  get: <T>(key: string) => T
  set: (key: string, value: unknown) => void
  delete: (key: string) => void
}

type LegacyStore = {
  get: <T>(key: string) => T
  set: <T>(key: string, value: T) => void
  has: (key: string) => boolean
}

export interface TemplateRuntime {
  templateStore: TemplateStore | null
  templateUserRoot: string
  migrationComplete: boolean
}

export async function initializeTemplateRuntime(
  appStore: AppStore,
  agentdeckRoot: string,
): Promise<TemplateRuntime> {
  const templateUserRoot = `${agentdeckRoot}/templates`
  let migrationComplete = false

  try {
    const migrationResult = await runTemplateMigration({
      store: appStore as unknown as MigrationStore,
      userRoot: templateUserRoot,
      seeds: seedTemplateData,
    })
    migrationComplete = migrationResult.status !== 'failed'
    log.info('template migration', {
      status: migrationResult.status,
      count: migrationResult.count,
    })
  } catch (err) {
    log.error('template migration threw - falling back to legacy store', {
      err: String(err),
    })
  }

  let templateStore: TemplateStore | null = null
  try {
    templateStore = await createTemplateStore({
      userRoot: templateUserRoot,
      getProjectPath: (projectId) => {
        const projects = appStore.get('projects') ?? []
        return projects.find((project) => project.id === projectId)?.path ?? null
      },
    })
  } catch (err) {
    log.error('createTemplateStore failed - legacy-only template access', {
      err: String(err),
    })
  }

  if (templateStore) {
    const legacy = createLegacyStoreAdapter(appStore as unknown as LegacyStore)
    const templateCtx = {
      store: templateStore,
      legacy,
      migrationComplete: (): boolean => migrationComplete,
      getProjectExists: (projectId: string): boolean => {
        const projects = appStore.get('projects') ?? []
        return projects.some((project) => project.id === projectId)
      },
    }
    registerTemplateIpc(templateCtx)
    registerLegacyTemplateIpc({
      store: templateStore,
      legacy,
      migrationComplete: templateCtx.migrationComplete,
    })
  }

  return { templateStore, templateUserRoot, migrationComplete }
}
