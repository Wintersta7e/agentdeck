import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { TemplateFile } from '../shared/types'
import { createLogger } from './logger'
import { atomicWrite } from './fs-atomic'

const log = createLogger('template-migration')

/** The pre-v6.1.0 flat template array as it sits in electron-store. */
interface StoredLegacyTemplate {
  id: string
  name: string
  description: string
  content?: string
  category?: TemplateFile['category']
}

interface MigrationOptions {
  store: {
    has: (k: string) => boolean
    /** Returns unknown: electron-store holds untyped JSON. */
    get: (k: string) => unknown
    set: (k: string, v: unknown) => void
    delete: (k: string) => void
  }
  userRoot: string
  seeds?: {
    id: string
    name: string
    description: string
    content?: string
    category?: TemplateFile['category']
  }[]
}

interface MigrationResult {
  status: 'migrated' | 'freshInstallSeeded' | 'skipped' | 'failed'
  count: number
  error?: string
}

function upgradeLegacyToFile(l: {
  id: string
  name: string
  description: string
  content?: string
  category?: TemplateFile['category']
}): TemplateFile {
  return {
    id: l.id,
    name: l.name,
    description: l.description,
    content: l.content ?? '',
    ...(l.category !== undefined ? { category: l.category } : {}),
    usageCount: 0,
    lastUsedAt: 0,
    pinned: false,
  }
}

export async function runTemplateMigration(opts: MigrationOptions): Promise<MigrationResult> {
  const prefs = (opts.store.get('appPrefs') as { templatesMigrated?: boolean } | undefined) ?? {}
  if (prefs.templatesMigrated === true) {
    return { status: 'skipped', count: 0 }
  }

  const legacyRaw = (opts.store.get('templates') as StoredLegacyTemplate[] | undefined) ?? []

  await fs.mkdir(opts.userRoot, { recursive: true })
  const staging = `${opts.userRoot}.migrating`

  // Fresh install: no legacy templates, write seeds directly.
  if (legacyRaw.length === 0) {
    try {
      for (const seed of opts.seeds ?? []) {
        const file = upgradeLegacyToFile(seed)
        await atomicWrite(join(opts.userRoot, `${file.id}.json`), JSON.stringify(file, null, 2))
      }
      opts.store.set('appPrefs', { ...prefs, templatesMigrated: true })
      return { status: 'freshInstallSeeded', count: opts.seeds?.length ?? 0 }
    } catch (err) {
      log.error('Fresh-install seeding failed', { err: String(err) })
      return { status: 'failed', count: 0, error: String(err) }
    }
  }

  // Migration: stage + swap.
  try {
    await fs.rm(staging, { recursive: true, force: true })
    await fs.mkdir(staging, { recursive: true })
    for (const l of legacyRaw) {
      const file = upgradeLegacyToFile(l)
      await atomicWrite(join(staging, `${file.id}.json`), JSON.stringify(file, null, 2))
    }
    // Atomic-ish dir swap: back up existing contents (if any), then replace with staging.
    const existing = await fs.readdir(opts.userRoot).catch(() => [])
    if (existing.length > 0) {
      const backup = `${opts.userRoot}.old`
      await fs.rm(backup, { recursive: true, force: true })
      await fs.rename(opts.userRoot, backup)
      await fs.rename(staging, opts.userRoot)
      await fs.rm(backup, { recursive: true, force: true })
    } else {
      await fs.rm(opts.userRoot, { recursive: true, force: true })
      await fs.rename(staging, opts.userRoot)
    }
    opts.store.set('appPrefs', { ...prefs, templatesMigrated: true })
    // Delete the legacy key (not set-to-undefined) so the migration is not
    // re-run if the renderer reads the store before the prefs flush.
    if (opts.store.has('templates')) {
      opts.store.delete('templates')
    }
    log.info('migrated templates to user scope', { count: legacyRaw.length })
    return { status: 'migrated', count: legacyRaw.length }
  } catch (err) {
    log.error('Migration failed, keeping legacy store', { err: String(err) })
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
    return { status: 'failed', count: 0, error: String(err) }
  }
}
