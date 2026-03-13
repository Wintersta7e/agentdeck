import Store from 'electron-store'
import { app, ipcMain, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { EnvVar, Project, Role, Template, TemplateCategory } from '../shared/types'
import { migrateProjectAgents } from '../shared/agent-helpers'
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
    // Throw on encryption failure to prevent storing plaintext secrets on disk.
    // A silent fallback causes data loss: next load tries to decrypt plaintext → empty string.
    const encrypted = safeStorage.encryptString(v.value).toString('base64')
    return { ...v, value: encrypted }
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
  roles: Role[]
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
    rolesSeedVersion?: number | undefined
  }
}

export type AppStore = Store<StoreSchema>

export function createProjectStore(): Store<StoreSchema> {
  const defaults: StoreSchema = {
    projects: [],
    templates: [],
    roles: [],
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

    // Auto-migrate legacy single-agent projects to agents[] array
    let agentsMigrated = false
    const updated = projects.map((p: Project) => {
      const m = migrateProjectAgents(p)
      if (m !== p) agentsMigrated = true
      return m
    })
    if (agentsMigrated) {
      // env vars are already encrypted on disk — write back as-is
      store.set('projects', updated)
    }

    return updated.map((p) => ({ ...p, envVars: decryptEnvVars(p.envVars) }))
  })

  ipcMain.handle('store:saveProject', (_, project: unknown) => {
    if (!project || typeof project !== 'object') {
      throw new Error('store:saveProject requires a non-null object')
    }
    // Validate required fields from renderer input before trusting the shape
    const raw = project as Record<string, unknown>
    if (raw.id !== undefined && typeof raw.id !== 'string')
      throw new Error('store:saveProject — id must be a string')
    if (raw.name !== undefined && typeof raw.name !== 'string')
      throw new Error('store:saveProject — name must be a string')
    if (raw.path !== undefined && typeof raw.path !== 'string')
      throw new Error('store:saveProject — path must be a string')
    if (typeof raw.name === 'string' && raw.name.length > 200)
      throw new Error('store:saveProject — name too long')
    if (typeof raw.path === 'string' && raw.path.length > 1024)
      throw new Error('store:saveProject — path too long')
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
    const rawT = template as Record<string, unknown>
    if (rawT.id !== undefined && typeof rawT.id !== 'string')
      throw new Error('store:saveTemplate — id must be a string')
    if (rawT.name !== undefined && typeof rawT.name !== 'string')
      throw new Error('store:saveTemplate — name must be a string')
    if (typeof rawT.name === 'string' && rawT.name.length > 200)
      throw new Error('store:saveTemplate — name too long')
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

  ipcMain.handle('store:getRoles', () => {
    return store.get('roles')
  })

  ipcMain.handle('store:saveRole', (_, role: unknown) => {
    if (!role || typeof role !== 'object') {
      throw new Error('store:saveRole requires a non-null object')
    }
    const rawR = role as Record<string, unknown>
    if (rawR.id !== undefined && typeof rawR.id !== 'string')
      throw new Error('store:saveRole — id must be a string')
    if (rawR.name !== undefined && typeof rawR.name !== 'string')
      throw new Error('store:saveRole — name must be a string')
    if (typeof rawR.name === 'string' && rawR.name.length > 200)
      throw new Error('store:saveRole — name too long')
    const r = role as Partial<Role>
    const roles = store.get('roles')
    const id = r.id ?? randomUUID()
    const withId = { ...r, id } as Role
    const idx = roles.findIndex((existing) => existing.id === id)
    const existingRole = idx >= 0 ? roles[idx] : undefined
    if (existingRole != null) {
      roles[idx] = { ...existingRole, ...withId }
    } else {
      roles.push(withId)
    }
    store.set('roles', roles)
    return roles[idx >= 0 ? idx : roles.length - 1]
  })

  ipcMain.handle('store:deleteRole', (_, id: string) => {
    const roles = store.get('roles').filter((r) => r.id !== id)
    store.set('roles', roles)
  })

  return store
}

const SEED_VERSION = 2

const ROLES_SEED_VERSION = 1

const SEED_ROLES: Omit<Role, 'id'>[] = [
  {
    name: 'Reviewer',
    icon: '\uD83D\uDCCB',
    persona:
      'You are a senior code reviewer. Analyze the code for bugs, security vulnerabilities, performance issues, and adherence to best practices. Rate each finding as HIGH, MEDIUM, or LOW severity. Be direct and actionable.',
    outputFormat:
      '## Review Report\n### Findings\n- [HIGH/MEDIUM/LOW] Description with file and line references\n### Summary\nOverall assessment and recommendation',
    builtin: true,
  },
  {
    name: 'Developer',
    icon: '\uD83D\uDD27',
    persona:
      'You are a senior developer. Implement features and fixes precisely per spec. Write clean, tested, production-ready code. Explain your changes clearly and note any side effects.',
    outputFormat:
      '## Implementation Summary\n### Changes Made\n- File: description of change\n### Notes\nAny caveats, trade-offs, or follow-up work needed',
    builtin: true,
  },
  {
    name: 'Tester',
    icon: '\uD83E\uDDEA',
    persona:
      'You are a QA engineer. Write comprehensive tests covering happy paths, edge cases, and error paths. Use the test framework already established in the project. Aim for meaningful coverage, not just line count.',
    outputFormat:
      '## Test Report\n### Tests Written\n- test name: what it covers\n### Coverage\nAreas covered and any gaps\n### Results\nPass/fail summary',
    builtin: true,
  },
  {
    name: 'Architect',
    icon: '\uD83C\uDFD7\uFE0F',
    persona:
      'You are a software architect. Evaluate design trade-offs, architectural fit, scalability, and maintainability. Consider the existing codebase patterns and conventions.',
    outputFormat:
      '## Architecture Assessment\n### Analysis\nHow the proposed changes fit the existing architecture\n### Recommendations\nSuggested improvements or alternatives\n### Risks\nPotential issues and mitigations',
    builtin: true,
  },
  {
    name: 'Security Auditor',
    icon: '\uD83D\uDD12',
    persona:
      'You are a security specialist. Audit code for OWASP Top 10 vulnerabilities, injection flaws, authentication gaps, data exposure, and misconfigurations. For each finding, describe how an attacker could exploit it.',
    outputFormat:
      '## Security Audit\n### Vulnerabilities\n- [CRITICAL/HIGH/MEDIUM/LOW] Description + exploitation path\n### Remediation\nExact fixes for each finding',
    builtin: true,
  },
  {
    name: 'Documentation Writer',
    icon: '\uD83D\uDCD6',
    persona:
      'You are a technical writer. Generate clear, accurate documentation from code. Match the existing doc style and conventions. Keep it concise — document the why, not just the what.',
    outputFormat: undefined,
    builtin: true,
  },
  {
    name: 'Refactorer',
    icon: '\u267B\uFE0F',
    persona:
      'You are a refactoring specialist. Improve code structure without changing behavior. Focus on readability, DRY principles, and SOLID. Verify behavior is preserved after each change.',
    outputFormat:
      '## Refactoring Summary\n### Changes\n- What was refactored and why\n### Behavior Verification\nHow to confirm nothing broke',
    builtin: true,
  },
  {
    name: 'Debugger',
    icon: '\uD83D\uDC1B',
    persona:
      'You are a debugging specialist. Investigate root causes systematically: reproduce the issue, form hypotheses, trace execution paths, isolate the fault, and verify the fix.',
    outputFormat:
      '## Debug Report\n### Root Cause\nWhat went wrong and why\n### Investigation\nSteps taken to isolate the issue\n### Fix\nExact changes made\n### Verification\nHow to confirm the fix works',
    builtin: true,
  },
]

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

export function seedRoles(store: AppStore): void {
  const prefs = store.get('appPrefs')
  const currentVersion = prefs.rolesSeedVersion ?? 0

  if (currentVersion >= ROLES_SEED_VERSION) return

  const existing = store.get('roles')

  // Fresh install — no existing roles
  if (existing.length === 0) {
    const seeded: Role[] = SEED_ROLES.map((r) => ({
      ...r,
      id: `seed-role-${randomUUID()}`,
    }))
    store.set('roles', seeded)
    store.set('appPrefs', { ...prefs, rolesSeedVersion: ROLES_SEED_VERSION })
    log.info(`Seeded ${seeded.length} built-in roles (v${String(ROLES_SEED_VERSION)})`)
    return
  }

  // Upgrade — replace old seed roles, preserve user-created ones
  const userRoles = existing.filter((r) => !r.id.startsWith('seed-role-'))
  const freshSeeds: Role[] = SEED_ROLES.map((r) => ({
    ...r,
    id: `seed-role-${randomUUID()}`,
  }))
  store.set('roles', [...freshSeeds, ...userRoles])
  store.set('appPrefs', { ...prefs, rolesSeedVersion: ROLES_SEED_VERSION })
  log.info(
    `Upgraded seed roles to v${String(ROLES_SEED_VERSION)}: ${String(freshSeeds.length)} seeds + ${String(userRoles.length)} user roles`,
  )
}
