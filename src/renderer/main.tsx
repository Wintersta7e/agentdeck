import { installAgentVersionInfoListener } from './bootstrap/agent-version-listener'
import { bootstrapInitialRendererState } from './bootstrap/initial-state'
import { renderAppRoot } from './bootstrap/render-root'
import { bootstrapWslAgentStatus } from './bootstrap/wsl-agent-status'
import { showFatalInitError } from './bootstrap/fatal-init-error'
import './styles/tokens.css'
import './styles/global.css'

async function initAndRender(): Promise<void> {
  await bootstrapInitialRendererState()
  renderAppRoot()
  installAgentVersionInfoListener(import.meta)
  await bootstrapWslAgentStatus()
}

initAndRender().catch(showFatalInitError)
