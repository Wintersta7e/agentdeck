import Store from 'electron-store'
import { app, ipcMain, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { EnvVar, Project, Template, TemplateCategory } from '../shared/types'
import { createLogger } from './logger'

const log = createLogger('project-store')

function encryptEnvVars(envVars: EnvVar[] | undefined): EnvVar[] | undefined {
  if (!envVars) return envVars
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('Encryption unavailable — secret env vars stored as plaintext')
    return envVars
  }
  return envVars.map((v) => {
    if (!v.secret) return v
    try {
      return { ...v, value: safeStorage.encryptString(v.value).toString('base64') }
    } catch (err) {
      log.error(`Failed to encrypt env var "${v.key}", storing as plaintext`, { err: String(err) })
      return v
    }
  })
}

function decryptEnvVars(envVars: EnvVar[] | undefined): EnvVar[] | undefined {
  if (!envVars) return envVars
  if (!safeStorage.isEncryptionAvailable()) return envVars
  return envVars.map((v) => {
    if (!v.secret) return v
    try {
      return { ...v, value: safeStorage.decryptString(Buffer.from(v.value, 'base64')) }
    } catch (err) {
      log.error(`Failed to decrypt env var "${v.key}", returning empty value`, { err: String(err) })
      return { ...v, value: '' }
    }
  })
}

export interface StoreSchema {
  projects: Project[]
  templates: Template[]
  appPrefs: {
    zoomFactor: number
    zoomAutoDetected?: boolean | number
    theme?: string
    visibleAgents?: string[]
    seeded?: boolean
    seedVersion?: number
    sidebarOpen?: boolean | undefined
    sidebarWidth?: number | undefined
    sidebarSections?: Record<string, boolean> | undefined
    rightPanelWidth?: number | undefined
    wfLogPanelWidth?: number | undefined
  }
}

export type AppStore = Store<StoreSchema>

export function createProjectStore(): Store<StoreSchema> {
  const defaults: StoreSchema = {
    projects: [],
    templates: [],
    appPrefs: { zoomFactor: 1.0, theme: '' },
  }

  let store: Store<StoreSchema>
  try {
    store = new Store<StoreSchema>({ defaults })
  } catch (err) {
    log.error('Store corrupted, deleting and recreating with defaults', { err: String(err) })
    try {
      const storePath = path.join(app.getPath('userData'), 'config.json')
      fs.unlinkSync(storePath)
    } catch {
      // File may not exist or already deleted
    }
    store = new Store<StoreSchema>({ defaults })
  }

  // One-time migration: fix project names that were set to the raw path
  const migrationProjects = store.get('projects')
  let migrated = false
  for (const p of migrationProjects) {
    if (p.name === p.path || p.name.includes('\\') || p.name.includes('/')) {
      p.name =
        p.path
          .replace(/[/\\]+$/, '')
          .split(/[/\\]/)
          .pop() ?? p.name
      migrated = true
    }
  }
  if (migrated) {
    store.set('projects', migrationProjects)
    log.info('Ran project name migration')
  }

  ipcMain.handle('store:getProjects', () => {
    const projects = store.get('projects')
    return projects.map((p) => ({ ...p, envVars: decryptEnvVars(p.envVars) }))
  })

  ipcMain.handle('store:saveProject', (_, project: unknown) => {
    if (!project || typeof project !== 'object') {
      throw new Error('store:saveProject requires a non-null object')
    }
    const p = project as Partial<Project>
    const projects = store.get('projects')
    const id = p.id ?? randomUUID()
    const withId = { ...p, id, envVars: encryptEnvVars(p.envVars) } as Project
    const idx = projects.findIndex((existing) => existing.id === id)
    const existing = idx >= 0 ? projects[idx] : undefined
    if (existing != null) {
      projects[idx] = { ...existing, ...withId }
    } else {
      projects.push(withId)
    }
    store.set('projects', projects)
    const savedIdx = idx >= 0 ? idx : projects.length - 1
    const saved = projects[savedIdx]
    if (!saved) throw new Error('store:saveProject — saved project not found after write')
    log.info(`Project saved: ${saved.name}`, { id: saved.id })
    return { ...saved, envVars: decryptEnvVars(saved.envVars) }
  })

  ipcMain.handle('store:deleteProject', (_, id: string) => {
    const projects = store.get('projects').filter((p) => p.id !== id)
    store.set('projects', projects)
    log.info(`Project deleted`, { id })
  })

  ipcMain.handle('store:getTemplates', () => {
    return store.get('templates')
  })

  ipcMain.handle('store:saveTemplate', (_, template: unknown) => {
    if (!template || typeof template !== 'object') {
      throw new Error('store:saveTemplate requires a non-null object')
    }
    const t = template as Partial<Template>
    const templates = store.get('templates')
    const id = t.id ?? randomUUID()
    const withId = { ...t, id } as Template
    const idx = templates.findIndex((existing) => existing.id === id)
    const existingTpl = idx >= 0 ? templates[idx] : undefined
    if (existingTpl != null) {
      templates[idx] = { ...existingTpl, ...withId }
    } else {
      templates.push(withId)
    }
    store.set('templates', templates)
    return templates[idx >= 0 ? idx : templates.length - 1]
  })

  ipcMain.handle('store:deleteTemplate', (_, id: string) => {
    const templates = store.get('templates').filter((t) => t.id !== id)
    store.set('templates', templates)
  })

  return store
}

const SEED_VERSION = 2

const SEED_TEMPLATES: Omit<Template, 'id'>[] = [
  // ── Orient ──
  {
    name: 'Codebase tour',
    category: 'Orient' as TemplateCategory,
    description: 'Map the architecture, entry points, and key modules',
    content:
      'Give me a tour of this codebase. Start with the overall architecture and main entry points, then walk through the key modules and how they connect. Note anything unusual, any obvious tech debt, and anything I should know before making changes.',
  },
  {
    name: 'Before I start',
    category: 'Orient' as TemplateCategory,
    description: 'Summarise stack, structure, and known issues before changing anything',
    content:
      "Before I make any changes: summarise the current state of this project. What's the stack, what does it do, what's the folder structure, and are there any known issues, TODOs, or incomplete work I should be aware of?",
  },
  {
    name: 'Explain this code',
    category: 'Orient' as TemplateCategory,
    description: 'Deep-dive explanation of how a specific piece of code works',
    content:
      'Explain how this code works. Walk through the control flow step by step, clarify what each major section does and why, note any non-obvious side effects or implicit dependencies, and flag anything that looks fragile or surprising.',
  },
  {
    name: 'Plan a feature',
    category: 'Orient' as TemplateCategory,
    description: 'Design an implementation plan before writing code',
    content:
      "I want to implement a new feature. Before writing any code:\n1. Clarify requirements — ask me questions if anything is ambiguous\n2. Identify which files and modules will need changes\n3. Propose a step-by-step implementation plan with small, reviewable diffs\n4. Call out risks, edge cases, and anything that could break existing behaviour\n\nDon't start coding until I approve the plan.",
  },

  // ── Review ──
  {
    name: 'Review this file',
    category: 'Review' as TemplateCategory,
    description: 'Scan for bugs, security issues, edge cases, and clarity problems',
    content:
      'Review the current file thoroughly. Check for:\n- Logic errors and unhandled edge cases\n- Security issues (injection, auth gaps, data exposure)\n- Performance concerns (unnecessary allocations, O(n\u00B2) loops, missing caching)\n- Readability problems (unclear names, tangled control flow, missing context)\n\nBe direct — rank findings by severity and include line references.',
  },
  {
    name: 'Security audit',
    category: 'Review' as TemplateCategory,
    description: 'OWASP-style vulnerability scan of recent changes',
    content:
      'Review the recent changes for security vulnerabilities:\n- Injection flaws (SQL, command, template, unsafe deserialization)\n- Authentication and authorization gaps (broken access control, privilege escalation)\n- Data exposure (secrets in logs, verbose error messages, PII leaks)\n- Input validation (missing sanitization, type coercion, length limits)\n- SSRF, XSS, and CSRF risks\n\nFor each finding: state the severity, describe how an attacker could exploit it, and provide the exact fix.',
  },
  {
    name: 'Performance review',
    category: 'Review' as TemplateCategory,
    description: 'Identify bottlenecks and rank optimisations by impact',
    content:
      "Profile this code for performance. Identify the top bottlenecks, then propose up to 3 optimisations ranked by impact vs. effort.\n\nFor each:\n- Which files and functions to change\n- Expected improvement and tradeoffs\n- How to benchmark before and after\n\nDon't optimise things that aren't slow. Focus on what actually matters.",
  },

  // ── Fix ──
  {
    name: 'Fix failing tests',
    category: 'Fix' as TemplateCategory,
    description: 'Diagnose root cause and fix without weakening assertions',
    content:
      "The tests are failing. Run the test suite, then for each failure:\n1. Explain the root cause — not just the symptom\n2. Propose the smallest safe fix\n3. Show how to verify the fix (commands or expected output)\n\nDon't weaken assertions or skip tests to make them pass.",
  },
  {
    name: 'Upgrade dependency',
    category: 'Fix' as TemplateCategory,
    description: 'Safely upgrade a package with breaking change analysis',
    content:
      'Upgrade the specified dependency to its latest version safely.\n\n1. Check the release notes for breaking changes\n2. Identify every place in the codebase affected by those changes\n3. Propose a staged plan: edits, test runs, and verification steps\n4. Include rollback instructions if the upgrade fails\n\nRun tests after each step and fix any compile or runtime errors.',
  },

  // ── Test ──
  {
    name: 'Write tests for this',
    category: 'Test' as TemplateCategory,
    description: 'Generate targeted tests for the current file or function',
    content:
      "Write tests for the code I'm working on. Cover:\n- Happy path with typical inputs\n- Edge cases (empty, null, boundary values, large inputs)\n- Error paths (invalid input, network failures, permission denied)\n- Any concurrency or timing-sensitive behaviour\n\nUse the test framework and style already established in this project. Name tests so failures clearly describe what broke.",
  },

  // ── Refactor ──
  {
    name: 'Clean this up',
    category: 'Refactor' as TemplateCategory,
    description: 'Improve clarity and maintainability without changing behaviour',
    content:
      "Refactor the current file to improve clarity and maintainability. Don't change behaviour — just make it easier to read and work with. Explain the key changes you made and why.",
  },
  {
    name: 'Convert to script',
    category: 'Refactor' as TemplateCategory,
    description: 'Turn a manual process into an idempotent, safe script',
    content:
      'Turn this manual process into a script or CLI command.\n\nRequirements:\n- Dry-run mode that shows what would change without doing it\n- Clear output: print exactly what happened and what to do next\n- Fail safely with actionable error messages\n- Idempotent — safe to run multiple times\n\nPrefer safe defaults. Add usage help text.',
  },

  // ── Debug ──
  {
    name: 'Trace this bug',
    category: 'Debug' as TemplateCategory,
    description: 'Systematic root-cause analysis from symptoms to fix',
    content:
      "I'm seeing unexpected behaviour. Help me debug it:\n1. Read the error output or symptoms I've described\n2. Form a hypothesis about the root cause\n3. Identify the exact file, function, and line where things go wrong\n4. Explain the chain of events: what triggers it, why it fails, what data is wrong\n5. Propose a fix and a way to verify it works\n\nDon't guess — trace the actual execution path.",
  },

  // ── Docs ──
  {
    name: 'Update docs',
    category: 'Docs' as TemplateCategory,
    description: 'Sync README and inline docs with recent code changes',
    content:
      "Update the documentation to match the code changed in this session. If there's a README, update the relevant sections. Update inline comments and docstrings where they've gone stale. Remove any docs that describe deleted functionality. Keep it accurate and concise — don't over-document obvious code.",
  },

  // ── Git ──
  {
    name: 'Commit message',
    category: 'Git' as TemplateCategory,
    description: 'Draft a conventional commit message for staged changes',
    content:
      'Write a commit message for the changes in this session. Use conventional commits format (feat/fix/refactor/docs/chore). Be specific about what changed and why — not just what files were touched. If multiple logical changes are staged, suggest splitting into separate commits.',
  },
  {
    name: 'PR description',
    category: 'Git' as TemplateCategory,
    description: 'Write a high-signal pull request summary',
    content:
      'Write a pull request description for the changes in this branch.\n\nInclude:\n- **Problem**: what was broken, missing, or needed — and who it affects\n- **Solution**: what you changed and why this approach over alternatives\n- **Key files**: the main files a reviewer should focus on\n- **Testing**: what was tested and how (commands, manual steps)\n- **Risks**: what could go wrong in production\n\nKeep it skimmable. Bullet points over paragraphs.',
  },
]

export function seedTemplates(store: AppStore): void {
  const prefs = store.get('appPrefs')
  const currentVersion = prefs.seedVersion ?? (prefs.seeded ? 1 : 0)

  if (currentVersion >= SEED_VERSION) return

  const existing = store.get('templates')

  // Fresh install — no existing templates
  if (existing.length === 0) {
    const seeded: Template[] = SEED_TEMPLATES.map((t) => ({
      ...t,
      id: `seed-${randomUUID()}`,
    }))
    store.set('templates', seeded)
    store.set('appPrefs', { ...prefs, seeded: true, seedVersion: SEED_VERSION })
    log.info(`Seeded ${seeded.length} built-in templates (v${String(SEED_VERSION)})`)
    return
  }

  // Upgrade — replace old seed templates, preserve user-created ones
  const userTemplates = existing.filter((t) => !t.id.startsWith('seed-'))
  const freshSeeds: Template[] = SEED_TEMPLATES.map((t) => ({
    ...t,
    id: `seed-${randomUUID()}`,
  }))
  store.set('templates', [...freshSeeds, ...userTemplates])
  store.set('appPrefs', { ...prefs, seeded: true, seedVersion: SEED_VERSION })
  log.info(
    `Upgraded seed templates to v${String(SEED_VERSION)}: ${String(freshSeeds.length)} seeds + ${String(userTemplates.length)} user templates`,
  )
}
