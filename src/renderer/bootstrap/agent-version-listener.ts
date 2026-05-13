import { AGENTS } from '../../shared/agents'
import { useAppStore } from '../store/appStore'

type HotImportMeta = ImportMeta & {
  hot?: {
    dispose: (cb: () => void) => void
  }
}

export function installAgentVersionInfoListener(meta: ImportMeta): void {
  const unsubVersionInfo = window.agentDeck.agents.onVersionInfo((info) => {
    const { setAgentVersion, addNotification } = useAppStore.getState()
    setAgentVersion(info.agentId, {
      current: info.current,
      latest: info.latest,
      updateAvailable: info.updateAvailable,
    })
    if (info.updateAvailable && info.current && info.latest) {
      const agent = AGENTS.find((a) => a.id === info.agentId)
      const name = agent?.name ?? info.agentId
      addNotification('info', `Update available: ${name} ${info.current} \u2192 ${info.latest}`)
    }
  })

  const cleanup = (): void => unsubVersionInfo()
  window.addEventListener('unload', cleanup, { once: true })

  const hot = (meta as HotImportMeta).hot
  if (hot) {
    hot.dispose(() => {
      window.removeEventListener('unload', cleanup)
      cleanup()
    })
  }
}
