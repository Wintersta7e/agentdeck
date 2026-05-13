import { parse as parseToml } from 'smol-toml'
import type { AgentEnvSnapshot, ConfigEntry, McpServerEntry, SkillEntry } from '../shared/types'
import { getDefaultDistroAsync } from './wsl-utils'
import { getCodexHome } from './wsl-paths'
import { scanSkillDirectory } from './skill-scanner'
import { createLogger } from './logger'
import { truncate, readWslParsed, type ReadOpts } from './agent-env-shared'

const log = createLogger('agent-env-codex')

export async function readCodexSnapshot(_opts: ReadOpts): Promise<AgentEnvSnapshot> {
  const [distro, codexHome] = await Promise.all([getDefaultDistroAsync(), getCodexHome()])
  const configToml = codexHome ? await readTomlSafe(`${codexHome}/config.toml`) : null

  const config: ConfigEntry[] = configToml ? extractConfig(configToml) : []
  const mcpServers: McpServerEntry[] = configToml ? extractMcp(configToml) : []
  const skills = await collectSkills(codexHome, distro)

  log.info('codex snapshot resolved', {
    codexHome,
    config: config.length,
    skills: skills.length,
    mcpServers: mcpServers.length,
  })

  return {
    agentId: 'codex',
    agentName: 'Codex',
    agentVersion: null,
    supportLevel: 'full',
    hooks: [],
    skills,
    mcpServers,
    config,
    paths: {
      userConfigDir: codexHome,
      projectConfigDir: null,
      agentdeckRoot: null,
      templateUserRoot: null,
      wslDistro: null,
      wslHome: null,
      projectAgentdeckDir: null,
    },
  }
}

function readTomlSafe(path: string): Promise<Record<string, unknown> | null> {
  return readWslParsed(path, (text) => parseToml(text) as Record<string, unknown>, log)
}

function extractConfig(toml: Record<string, unknown>): ConfigEntry[] {
  const out: ConfigEntry[] = []
  // Keys that appear as top-level scalars in real-world Codex `config.toml`
  // installs: `model`, `model_reasoning_effort`, `personality`, plus the
  // older `sandbox` / `approval_policy` / `reasoning_effort` shapes for
  // back-compat. Anything else stays unsurfaced (project entries are huge
  // and noisy).
  const KEYS = [
    'model',
    'model_reasoning_effort',
    'personality',
    'sandbox',
    'approval_policy',
    'reasoning_effort',
  ] as const
  for (const key of KEYS) {
    const v = toml[key]
    if (typeof v === 'string') out.push({ key, value: truncate(v), scope: 'user' })
  }
  return out
}

function extractMcp(toml: Record<string, unknown>): McpServerEntry[] {
  const servers = toml['mcp_servers']
  if (!servers || typeof servers !== 'object') return []
  const out: McpServerEntry[] = []
  for (const [name, def] of Object.entries(servers as Record<string, unknown>)) {
    if (!def || typeof def !== 'object') continue
    const command = (def as { command?: unknown }).command
    const args = (def as { args?: unknown }).args
    const url = (def as { url?: unknown }).url

    let type: McpServerEntry['type'] = 'stdio'
    if (typeof url === 'string') type = url.startsWith('http') ? 'http' : 'sse'

    const entry: McpServerEntry = { name, type, scope: 'user', status: 'configured' }
    if (typeof command === 'string') {
      const summary = Array.isArray(args) ? `${command} ${args.join(' ')}` : command
      entry.command = truncate(summary)
    }
    if (typeof url === 'string') entry.url = truncate(url)
    out.push(entry)
  }
  return out
}

async function collectSkills(codexHome: string | null, distro: string): Promise<SkillEntry[]> {
  if (!codexHome) return []
  const result = await scanSkillDirectory(`${codexHome}/skills`, 'global', distro)
  return result.skills.map((s) => ({ name: s.name, scope: 'user' as const, path: s.path }))
}
