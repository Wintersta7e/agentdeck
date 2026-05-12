import { useAppStore } from '../store/appStore'

export async function bootstrapInitialRendererState(): Promise<void> {
  const visibleAgentsPromise = window.agentDeck.agents.getVisible()
  const layoutPromise = window.agentDeck.layout.get()

  const theme = await window.agentDeck.theme.get()
  if (theme) {
    document.documentElement.dataset.theme = theme
  }

  const [visibleAgents, layout] = await Promise.all([visibleAgentsPromise, layoutPromise])
  if (visibleAgents) {
    useAppStore.setState({ visibleAgents })
  }

  useAppStore.setState({
    ...(layout.rightPanelWidth !== undefined && { rightPanelWidth: layout.rightPanelWidth }),
    ...(layout.wfLogPanelWidth !== undefined && { wfLogPanelWidth: layout.wfLogPanelWidth }),
  })

  await useAppStore.getState().bootstrapTemplates()
}
