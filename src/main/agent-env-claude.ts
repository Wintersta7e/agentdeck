import { parse as parseJsonc } from 'jsonc-parser'
import type {
  AgentEnvSnapshot,
  HookEntry,
  SkillEntry,
  McpServerEntry,
  ConfigEntry,
} from '../shared/types'
import { getDefaultDistroAsync } from './wsl-utils'
import { getClaudeConfigDir, getWslHome } from './wsl-paths'
import { scanSkillDirectory } from './skill-scanner'
import { createLogger } from './logger'
import { truncate, readWslParsed, type ReadOpts } from './agent-env-shared'

const log = createLogger('agent-env-claude')

const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'SessionStart',
  'Stop',
  'UserPromptSubmit',
  'PreCompact',
  'Notification',
] as const

export async function readClaudeSnapshot(opts: ReadOpts): Promise<AgentEnvSnapshot> {
  const [distro, home, userConfigDir] = await Promise.all([
    getDefaultDistroAsync(),
    getWslHome(),
    getClaudeConfigDir(),
  ])
  const projectConfigDir = opts.projectPath ? `${opts.projectPath}/.claude` : null

  const [userSettings, projectSettings] = await Promise.all([
    userConfigDir ? readJsonSafe(`${userConfigDir}/settings.json`) : Promise.resolve(null),
    projectConfigDir ? readJsonSafe(`${projectConfigDir}/settings.json`) : Promise.resolve(null),
  ])

  const hooks: HookEntry[] = []
  if (userSettings) hooks.push(...extractHooks(userSettings, 'user'))
  if (projectSettings) hooks.push(...extractHooks(projectSettings, 'project'))

  const config: ConfigEntry[] = []
  if (userSettings) config.push(...extractConfig(userSettings, 'user'))
  if (projectSettings) config.push(...extractConfig(projectSettings, 'project'))

  const [skills, mcpServers] = await Promise.all([
    collectSkills(userConfigDir, distro, opts.projectPath),
    collectMcpServers(userConfigDir, home, opts.projectPath),
  ])

  log.info('claude snapshot resolved', {
    projectPath: opts.projectPath ?? null,
    userConfigDir,
    hooks: hooks.length,
    skills: skills.length,
    mcpServers: mcpServers.length,
    config: config.length,
  })

  return {
    agentId: 'claude-code',
    agentName: 'Claude Code',
    agentVersion: null,
    supportLevel: 'full',
    hooks,
    skills,
    mcpServers,
    config,
    paths: {
      userConfigDir,
      projectConfigDir,
      agentdeckRoot: null,
      templateUserRoot: null,
      wslDistro: null,
      wslHome: null,
      projectAgentdeckDir: null,
    },
  }
}

function readJsonSafe(path: string): Promise<Record<string, unknown> | null> {
  return readWslParsed(
    path,
    (text) => (parseJsonc(text) as Record<string, unknown> | undefined) ?? null,
    log,
  )
}

function extractHooks(settings: Record<string, unknown>, scope: 'user' | 'project'): HookEntry[] {
  const hooksObj = settings['hooks']
  if (!hooksObj || typeof hooksObj !== 'object') return []
  const out: HookEntry[] = []
  for (const event of HOOK_EVENTS) {
    const eventArr = (hooksObj as Record<string, unknown>)[event]
    if (!Array.isArray(eventArr)) continue
    for (const item of eventArr) {
      if (!item || typeof item !== 'object') continue
      const matcher = (item as { matcher?: unknown }).matcher
      const hookList = (item as { hooks?: unknown }).hooks
      if (!Array.isArray(hookList)) continue
      for (const h of hookList) {
        if (!h || typeof h !== 'object') continue
        const command = (h as { command?: unknown }).command
        if (typeof command !== 'string') continue
        out.push({
          event,
          scope,
          command: truncate(command),
          ...(typeof matcher === 'string' ? { matchers: [matcher] } : {}),
        })
      }
    }
  }
  return out
}

function extractConfig(
  settings: Record<string, unknown>,
  scope: 'user' | 'project',
): ConfigEntry[] {
  const out: ConfigEntry[] = []
  const model = settings['model']
  if (typeof model === 'string') out.push({ key: 'model', value: truncate(model), scope })

  const env = settings['env']
  if (env && typeof env === 'object') {
    out.push({ key: 'env', value: truncate(JSON.stringify(env)), scope })
  }

  const statusLine = settings['statusLine']
  if (statusLine && typeof statusLine === 'object') {
    const cmd = (statusLine as { command?: unknown }).command
    if (typeof cmd === 'string') {
      out.push({ key: 'statusLine.command', value: truncate(cmd), scope })
    }
  }

  const permissions = settings['permissions']
  if (permissions && typeof permissions === 'object') {
    const mode = (permissions as { defaultMode?: unknown }).defaultMode
    if (typeof mode === 'string') {
      out.push({ key: 'permissions.defaultMode', value: truncate(mode), scope })
    }
  }

  return out
}

async function collectSkills(
  userConfigDir: string | null,
  distro: string,
  projectPath?: string,
): Promise<SkillEntry[]> {
  const out: SkillEntry[] = []

  if (userConfigDir) {
    const userResult = await scanSkillDirectory(`${userConfigDir}/skills`, 'global', distro)
    for (const s of userResult.skills) {
      out.push({ name: s.name, scope: 'user', path: s.path })
    }
  }

  if (projectPath) {
    const projResult = await scanSkillDirectory(`${projectPath}/.claude/skills`, 'project', distro)
    for (const s of projResult.skills) {
      out.push({ name: s.name, scope: 'project', path: s.path })
    }
  }

  return out
}

/**
 * Collect MCP servers. Claude Code's canonical user-scope storage is
 * `~/.claude.json` (a single user state file at the home root, NOT in the
 * `.claude/` directory) under the top-level `mcpServers` key. The same file
 * also carries per-project user overrides under `projects[<projectPath>].mcpServers`.
 *
 * Sources, in priority order (all merged into one list):
 *  1. `~/.claude.json` top-level `mcpServers` → scope `'user'`
 *  2. `~/.claude.json` `projects[<projectPath>].mcpServers` → scope `'user'`
 *     (user-authored project override; lives in the user file but applies only
 *     to one project)
 *  3. `<userConfigDir>/mcp.json` → scope `'user'` (legacy / older Claude Code
 *     setups; almost never present today, kept for back-compat)
 *  4. `<projectPath>/.mcp.json` → scope `'project'` (committed/team-shared)
 *
 * The `claude mcp list` CLI does not have a `--json` flag in current Claude
 * Code releases, so there is no CLI fallback — the file-backed sources above
 * are the source of truth.
 */
async function collectMcpServers(
  userConfigDir: string | null,
  home: string | null,
  projectPath?: string,
): Promise<McpServerEntry[]> {
  const out: McpServerEntry[] = []

  if (home) {
    const claudeJson = await readJsonSafe(`${home}/.claude.json`)
    if (claudeJson) {
      out.push(...parseMcpJson(claudeJson, 'user'))
      if (projectPath) {
        const projects = claudeJson['projects']
        if (projects && typeof projects === 'object') {
          const projectEntry = (projects as Record<string, unknown>)[projectPath]
          if (projectEntry && typeof projectEntry === 'object') {
            out.push(...parseMcpJson(projectEntry as Record<string, unknown>, 'user'))
          }
        }
      }
    }
  }

  if (userConfigDir) {
    const legacyMcp = await readJsonSafe(`${userConfigDir}/mcp.json`)
    if (legacyMcp) out.push(...parseMcpJson(legacyMcp, 'user'))
  }

  if (projectPath) {
    const projectMcp = await readJsonSafe(`${projectPath}/.mcp.json`)
    if (projectMcp) out.push(...parseMcpJson(projectMcp, 'project'))
  }

  return out
}

function parseMcpJson(json: Record<string, unknown>, scope: 'user' | 'project'): McpServerEntry[] {
  const servers = json['mcpServers']
  if (!servers || typeof servers !== 'object') return []
  const out: McpServerEntry[] = []
  for (const [name, def] of Object.entries(servers as Record<string, unknown>)) {
    if (!def || typeof def !== 'object') continue
    const command = (def as { command?: unknown }).command
    const url = (def as { url?: unknown }).url
    const args = (def as { args?: unknown }).args
    let type: McpServerEntry['type'] = 'stdio'
    if (typeof url === 'string') type = url.startsWith('http') ? 'http' : 'sse'

    const entry: McpServerEntry = { name, type, scope, status: 'configured' }
    if (typeof command === 'string') {
      const cmdSummary = Array.isArray(args) ? `${command} ${args.join(' ')}` : command
      entry.command = truncate(cmdSummary)
    }
    if (typeof url === 'string') entry.url = truncate(url)
    out.push(entry)
  }
  return out
}
