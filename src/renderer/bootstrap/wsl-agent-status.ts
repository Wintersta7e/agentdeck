import { useAppStore } from '../store/appStore'

interface WslAgentStatus {
  username: string
  agents: Record<string, boolean>
}

async function fetchWslAgentStatus(): Promise<WslAgentStatus> {
  const [username, agents, distro] = await Promise.all([
    window.agentDeck.app.wslUsername().catch((err: unknown) => {
      window.agentDeck.log.send('warn', 'init', 'WSL username fetch failed', {
        err: String(err),
      })
      return ''
    }),
    window.agentDeck.agents.check().catch((err: unknown) => {
      window.agentDeck.log.send('warn', 'init', 'Agent check failed', { err: String(err) })
      return {} as Record<string, boolean>
    }),
    window.agentDeck.projects.getDefaultDistro().catch((err: unknown) => {
      window.agentDeck.log.send('warn', 'init', 'WSL distro fetch failed', { err: String(err) })
      return ''
    }),
  ])

  useAppStore.setState({
    wslUsername: username,
    agentStatus: agents,
    wslDistro: typeof distro === 'string' ? distro : '',
  })

  return { username, agents }
}

function checkAgentUpdates(installedAgents: Record<string, boolean>): void {
  void window.agentDeck.agents.checkUpdates(installedAgents).catch((err: unknown) => {
    window.agentDeck.log.send('warn', 'init', 'checkUpdates failed', { err: String(err) })
  })
}

export async function bootstrapWslAgentStatus(): Promise<void> {
  const { username, agents } = await fetchWslAgentStatus()
  const allMissing = Object.keys(agents).length === 0 || Object.values(agents).every((v) => !v)

  if (!username && allMissing) {
    setTimeout(() => {
      void fetchWslAgentStatus()
        .then(({ agents: retryAgents }) => {
          if (Object.values(retryAgents).some((v) => v)) {
            checkAgentUpdates(retryAgents)
          }
        })
        .catch((err: unknown) => {
          window.agentDeck.log.send('warn', 'init', 'WSL retry also failed', {
            err: String(err),
          })
        })
    }, 5000)
    return
  }

  checkAgentUpdates(agents)
}
