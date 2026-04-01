import { execFile } from 'child_process'
import { createLogger } from './logger'
import { getDefaultDistroAsync } from './wsl-utils'
import type { SkillInfo } from '../shared/types'

const log = createLogger('skill-scanner')

// ── Constants ──────────────────────────────────────────────────────

/** Valid skill names: alphanumeric, hyphens, underscores only */
export const SAFE_SKILL_RE = /^[a-zA-Z0-9_-]+$/

const GLOBAL_TTL_MS = 60_000
const PROJECT_TTL_MS = 30_000
const WSL_TIMEOUT_MS = 15_000
const MAX_PROJECT_CACHE_SIZE = 50

/** Separator emitted between SKILL.md blocks in WSL find output */
const BLOCK_SEPARATOR = '---SKILL-BLOCK---'

// ── Types ──────────────────────────────────────────────────────────

export interface ParsedFrontmatter {
  name: string
  description: string
}

export interface ScanResult {
  skills: SkillInfo[]
  skipped: number
  status: 'ok' | 'partial' | 'failed'
  error?: string | undefined
}

interface SkillCache {
  skills: SkillInfo[]
  skipped: number
  timestamp: number
}

// ── Cache state ────────────────────────────────────────────────────

let globalCache: SkillCache | null = null
const cachedHomePaths = new Map<string, string>()
const projectCache = new Map<string, SkillCache>()
const inFlight = new Map<string, Promise<SkillCache>>()

// ── Shell-quoting ──────────────────────────────────────────────────

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

// ── WSL execution helper ───────────────────────────────────────────

function wslExec(cmd: string, distro?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const args = distro ? ['-d', distro, '--', 'bash', '-lc', cmd] : ['--', 'bash', '-lc', cmd]
    execFile(
      'wsl.exe',
      args,
      { timeout: WSL_TIMEOUT_MS, encoding: 'utf-8' },
      (err, stdout, stderr) => {
        if (err) {
          log.warn('wslExec failed', { cmd: cmd.slice(0, 120), err: String(err) })
          resolve(null)
          return
        }
        if (stderr.trim()) {
          log.debug('wslExec stderr', { cmd: cmd.slice(0, 120), stderr: stderr.slice(0, 500) })
        }
        resolve(stdout)
      },
    )
  })
}

// ── Cached $HOME resolution ───────────────────────────────────────

async function resolveHomePath(distro: string): Promise<string | null> {
  const cached = cachedHomePaths.get(distro)
  if (cached) return cached
  const output = await wslExec('echo $HOME', distro)
  const home = output?.trim() ?? null
  if (home) cachedHomePaths.set(distro, home)
  return home
}

// ── Frontmatter parsing ───────────────────────────────────────────

export function parseFrontmatter(content: string, dirName: string): ParsedFrontmatter | null {
  const lines = content.split('\n')
  const firstLine = lines[0]

  // Must start with ---
  if (!firstLine || firstLine.trim() !== '---') {
    return null
  }

  // Find closing --- within 100 lines
  let closingIdx = -1
  const scanLimit = Math.min(lines.length, 101) // line 0 is opening, scan up to line 100
  for (let i = 1; i < scanLimit; i++) {
    const line = lines[i]
    if (line !== undefined && line.trim() === '---') {
      closingIdx = i
      break
    }
  }

  if (closingIdx === -1) {
    return null
  }

  // Extract key: value pairs from frontmatter block
  const fields = new Map<string, string>()
  for (let i = 1; i < closingIdx; i++) {
    const line = lines[i]
    if (line === undefined) continue
    const match = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (match) {
      const key = match[1]
      const value = match[2]
      if (key !== undefined && value !== undefined) {
        fields.set(key.toLowerCase(), value.trim())
      }
    }
  }

  // Name: from field or directory fallback, canonicalized to lowercase
  let name = fields.get('name') ?? dirName
  name = name.toLowerCase().trim()

  // Validate against SAFE_SKILL_RE
  if (!name || !SAFE_SKILL_RE.test(name)) {
    return null
  }

  // Description: from field or first non-empty line after closing ---
  let description = fields.get('description') ?? ''
  if (!description) {
    for (let i = closingIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      if (line !== undefined && line.trim()) {
        description = line.trim()
        break
      }
    }
  }

  return { name, description }
}

// ── Directory scanning ────────────────────────────────────────────

export async function scanSkillDirectory(
  rootPath: string,
  scope: 'global' | 'project',
  distro?: string,
): Promise<ScanResult> {
  // Build a single bash command that:
  // 1. Checks if directory exists
  // 2. Finds SKILL.md files (maxdepth 3)
  // 3. For each: prints separator, path, parent dirname, first 100 lines
  const quotedRoot = shellQuote(rootPath)
  const cmd = [
    `if [ ! -d ${quotedRoot} ]; then echo '__DIR_MISSING__'; exit 0; fi`,
    `find ${quotedRoot} -maxdepth 3 -name SKILL.md -type f | sort | while IFS= read -r f; do`,
    `  echo '${BLOCK_SEPARATOR}'`,
    `  echo "$f"`,
    `  echo "$(basename "$(dirname "$f")")"`,
    `  head -n 100 "$f"`,
    'done',
  ].join('\n')

  const output = await wslExec(cmd, distro)

  if (output === null) {
    return { skills: [], skipped: 0, status: 'failed', error: 'WSL is not running or timed out' }
  }

  if (output.trim() === '__DIR_MISSING__') {
    return { skills: [], skipped: 0, status: 'ok' }
  }

  const skills: SkillInfo[] = []
  let skipped = 0
  const seenNames = new Set<string>()

  // Split by separator and process each block
  const blocks = output.split(BLOCK_SEPARATOR).filter((b) => b.trim())

  for (const block of blocks) {
    const blockLines = block.split('\n')

    // Skip leading empty lines
    let startIdx = 0
    while (startIdx < blockLines.length && blockLines[startIdx]?.trim() === '') {
      startIdx++
    }

    const filePath = blockLines[startIdx]?.trim()
    const parentDir = blockLines[startIdx + 1]?.trim()

    if (!filePath || !parentDir) {
      skipped++
      continue
    }

    // Remaining lines are the file content (first 100 lines)
    const contentLines = blockLines.slice(startIdx + 2)
    const content = contentLines.join('\n')

    const parsed = parseFrontmatter(content, parentDir)
    if (!parsed) {
      skipped++
      continue
    }

    // Check for intra-scope duplicates
    if (seenNames.has(parsed.name)) {
      skipped++
      continue
    }
    seenNames.add(parsed.name)

    skills.push({
      id: `${scope}:${parsed.name}`,
      name: parsed.name,
      description: parsed.description,
      path: filePath,
      scope,
    })
  }

  const status = skipped > 0 ? 'partial' : 'ok'
  return { skills, skipped, status }
}

// ── Cache helpers ──────────────────────────────────────────────────

function isFresh(cache: SkillCache, ttlMs: number): boolean {
  return Date.now() - cache.timestamp < ttlMs
}

function cacheKey(scope: string, path: string, distro: string): string {
  return `${scope}:${distro}:${path}`
}

// ── Public API ─────────────────────────────────────────────────────

export async function getGlobalSkills(
  distro?: string,
): Promise<{ skills: SkillInfo[]; skipped: number; timestamp: number }> {
  if (globalCache && isFresh(globalCache, GLOBAL_TTL_MS)) {
    return globalCache
  }

  const resolvedDistro = distro ?? (await getDefaultDistroAsync())

  // Resolve $HOME (cached after first success) for stable cache key
  const homePath = await resolveHomePath(resolvedDistro)

  if (!homePath) {
    log.warn('Could not resolve $HOME for global skill scan')
    // Don't cache — WSL may come back later
    return { skills: [], skipped: 0, timestamp: Date.now() }
  }

  const globalSkillsPath = `${homePath}/.codex/skills`
  const key = cacheKey('global', globalSkillsPath, resolvedDistro)

  // Deduplicate in-flight requests
  const existing = inFlight.get(key)
  if (existing) {
    return existing
  }

  const promise = (async (): Promise<SkillCache> => {
    const scanResult = await scanSkillDirectory(globalSkillsPath, 'global', resolvedDistro)

    const cache: SkillCache = {
      skills: scanResult.skills,
      skipped: scanResult.skipped,
      timestamp: Date.now(),
    }
    if (scanResult.status !== 'failed') {
      globalCache = cache
    }
    return cache
  })()

  inFlight.set(key, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}

export async function getProjectSkills(
  projectPath: string,
  distro?: string,
): Promise<{ skills: SkillInfo[]; skipped: number; timestamp: number }> {
  const resolvedDistro = distro ?? (await getDefaultDistroAsync())
  const key = cacheKey('project', projectPath, resolvedDistro)

  const cached = projectCache.get(key)
  if (cached && isFresh(cached, PROJECT_TTL_MS)) {
    cached.timestamp = Date.now() // refresh recency for LRU
    return cached
  }

  // Deduplicate in-flight requests
  const existing = inFlight.get(key)
  if (existing) {
    return existing
  }

  const promise = (async (): Promise<SkillCache> => {
    const skillsDir = `${projectPath}/.agents/skills`
    const scanResult = await scanSkillDirectory(skillsDir, 'project', resolvedDistro)

    const cache: SkillCache = {
      skills: scanResult.skills,
      skipped: scanResult.skipped,
      timestamp: Date.now(),
    }
    // Only cache successful scans — failed scans may recover on retry
    if (scanResult.status !== 'failed') {
      // Evict oldest entry if cache is full and this is a new key
      if (!projectCache.has(key) && projectCache.size >= MAX_PROJECT_CACHE_SIZE) {
        let oldestKey: string | null = null
        let oldestTs = Infinity
        for (const [k, v] of projectCache) {
          if (v.timestamp < oldestTs) {
            oldestTs = v.timestamp
            oldestKey = k
          }
        }
        if (oldestKey) projectCache.delete(oldestKey)
      }
      projectCache.set(key, cache)
    }
    return cache
  })()

  inFlight.set(key, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}

export async function listSkills(opts: {
  projectPath?: string | undefined
  includeGlobal?: boolean | undefined
  distro?: string | undefined
}): Promise<SkillInfo[]> {
  const { projectPath, includeGlobal = true, distro } = opts
  const results: SkillInfo[] = []

  // Fetch in parallel where possible
  const promises: Promise<void>[] = []

  if (includeGlobal) {
    promises.push(
      getGlobalSkills(distro).then((r) => {
        results.push(...r.skills)
      }),
    )
  }

  if (projectPath) {
    promises.push(
      getProjectSkills(projectPath, distro).then((r) => {
        results.push(...r.skills)
      }),
    )
  }

  await Promise.all(promises)

  // Deduplicate: project scope wins over global for same name
  const seen = new Map<string, SkillInfo>()
  for (const skill of results) {
    const existing = seen.get(skill.name)
    if (!existing || (skill.scope === 'project' && existing.scope === 'global')) {
      seen.set(skill.name, skill)
    }
  }

  return Array.from(seen.values())
}

export function invalidateProjectCache(projectPath: string): void {
  // Remove all entries matching this project path (any distro).
  // CQ-5: Use exact key segment match instead of suffix match to prevent
  // false positives when one path is a suffix of another.
  const suffix = `:${projectPath}`
  for (const key of projectCache.keys()) {
    // Key format: "project:<distro>:<path>" — extract path after second colon
    const secondColon = key.indexOf(':', key.indexOf(':') + 1)
    if (secondColon !== -1 && key.slice(secondColon) === suffix) {
      projectCache.delete(key)
    }
  }
  // R4-10: Do NOT delete from inFlight — let in-progress scans complete and
  // re-populate the cache with fresh data. Deleting would cause the old promise
  // to still write its result while a new scan starts, creating a race.
}

export function invalidateAllCaches(): void {
  globalCache = null
  cachedHomePaths.clear()
  projectCache.clear()
  inFlight.clear()
}
