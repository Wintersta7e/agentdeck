import { parse as parseYaml } from 'yaml'
import type {
  AgentEnvSnapshot,
  AgentSupportLevel,
  ConfigEntry,
  McpServerEntry,
} from '../shared/types'
import { getWslHome } from './wsl-paths'
import { createLogger } from './logger'
import { truncate, readWslParsed } from './agent-env-shared'

const log = createLogger('agent-env-other')

interface ReadOpts {
  agentId: string
  projectPath?: string | undefined
}

export async function readOtherAgentSnapshot(opts: ReadOpts): Promise<AgentEnvSnapshot> {
  switch (opts.agentId) {
    case 'aider':
      return readAider(opts.projectPath)
    case 'goose':
      return readGoose()
    case 'gemini-cli':
      return placeholder('gemini-cli', 'Gemini CLI')
    case 'amazon-q':
      return placeholder('amazon-q', 'Amazon Q')
    case 'opencode':
      return placeholder('opencode', 'OpenCode')
    default:
      throw new Error(`unsupported agent: ${opts.agentId}`)
  }
}

async function readAider(projectPath?: string): Promise<AgentEnvSnapshot> {
  const home = await getWslHome()
  const userConf = home ? await readYamlSafe(`${home}/.aider.conf.yml`) : null
  const projectConf = projectPath ? await readYamlSafe(`${projectPath}/.aider.conf.yml`) : null

  const config: ConfigEntry[] = []
  if (userConf) config.push(...extractAiderConfig(userConf, 'user'))
  if (projectConf) config.push(...extractAiderConfig(projectConf, 'project'))

  return {
    agentId: 'aider',
    agentName: 'Aider',
    agentVersion: null,
    supportLevel: 'minimal',
    hooks: [],
    skills: [],
    mcpServers: [],
    config,
    paths: {
      userConfigDir: home,
      projectConfigDir: projectPath ?? null,
      agentdeckRoot: null,
      templateUserRoot: null,
      wslDistro: null,
      wslHome: null,
      projectAgentdeckDir: null,
    },
  }
}

function extractAiderConfig(
  yaml: Record<string, unknown>,
  scope: 'user' | 'project',
): ConfigEntry[] {
  const out: ConfigEntry[] = []
  for (const key of ['model', 'edit-format', 'auto-commits', 'dirty-commits'] as const) {
    const v = yaml[key]
    if (v !== undefined) {
      out.push({ key, value: truncate(String(v)), scope })
    }
  }
  return out
}

async function readGoose(): Promise<AgentEnvSnapshot> {
  const home = await getWslHome()
  const conf = home ? await readYamlSafe(`${home}/.config/goose/config.yaml`) : null

  const config: ConfigEntry[] = []
  const mcpServers: McpServerEntry[] = []

  if (conf) {
    const provider = conf['GOOSE_PROVIDER']
    const model = conf['GOOSE_MODEL']
    if (typeof provider === 'string') {
      config.push({ key: 'provider', value: truncate(provider), scope: 'user' })
    }
    if (typeof model === 'string') {
      config.push({ key: 'model', value: truncate(model), scope: 'user' })
    }

    const extensions = conf['extensions']
    if (extensions && typeof extensions === 'object') {
      for (const [name, def] of Object.entries(extensions as Record<string, unknown>)) {
        if (!def || typeof def !== 'object') continue
        // Filter: skip pure `type: builtin` entries first, since Goose builtins
        // are not MCP servers even if a command is present.
        const extType = (def as { type?: unknown }).type
        if (extType === 'builtin') continue
        const cmdRef = (def as { command?: unknown }).command
        if (typeof cmdRef !== 'string') continue
        mcpServers.push({
          name,
          type: 'stdio',
          scope: 'user',
          command: truncate(cmdRef),
          status: 'configured',
        })
      }
    }
  }

  return {
    agentId: 'goose',
    agentName: 'Goose',
    agentVersion: null,
    supportLevel: 'minimal',
    hooks: [],
    skills: [],
    mcpServers,
    config,
    paths: {
      userConfigDir: home ? `${home}/.config/goose` : null,
      projectConfigDir: null,
      agentdeckRoot: null,
      templateUserRoot: null,
      wslDistro: null,
      wslHome: null,
      projectAgentdeckDir: null,
    },
  }
}

function placeholder(agentId: string, agentName: string): AgentEnvSnapshot {
  const supportLevel: AgentSupportLevel = 'future'
  return {
    agentId,
    agentName,
    agentVersion: null,
    supportLevel,
    hooks: [],
    skills: [],
    mcpServers: [],
    config: [],
    paths: {
      userConfigDir: null,
      projectConfigDir: null,
      agentdeckRoot: null,
      templateUserRoot: null,
      wslDistro: null,
      wslHome: null,
      projectAgentdeckDir: null,
    },
  }
}

function readYamlSafe(path: string): Promise<Record<string, unknown> | null> {
  return readWslParsed(
    path,
    (text) => {
      const parsed = parseYaml(text) as Record<string, unknown> | null
      return parsed && typeof parsed === 'object' ? parsed : null
    },
    log,
  )
}
