import { useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { AGENTS } from '../../../shared/agents'
import { CollapsibleSection } from '../shared/CollapsibleSection'
import './AgentStrip.css'

export function AgentStrip(): React.JSX.Element {
  const agentStatus = useAppStore((s) => s.agentStatus)
  const agentVersions = useAppStore((s) => s.agentVersions)
  const setAgentUpdating = useAppStore((s) => s.setAgentUpdating)
  const setAgentVersion = useAppStore((s) => s.setAgentVersion)
  const addNotification = useAppStore((s) => s.addNotification)
  const refreshAgentStatus = useAppStore((s) => s.refreshAgentStatus)

  const handleUpdate = useCallback(
    async (agentId: string) => {
      setAgentUpdating(agentId, true)
      try {
        const result = await window.agentDeck.agents.update(agentId)
        const name = AGENTS.find((a) => a.id === agentId)?.name ?? agentId
        if (result.success) {
          addNotification('info', `${name} updated to ${result.newVersion ?? 'latest'}`)
          setAgentVersion(agentId, {
            current: result.newVersion,
            latest: result.newVersion,
            updateAvailable: false,
          })
        } else {
          addNotification('error', `Failed to update ${name}: ${result.message}`)
        }
      } catch (err: unknown) {
        addNotification('error', `Update error: ${String(err)}`)
      } finally {
        setAgentUpdating(agentId, false)
        void refreshAgentStatus()
      }
    },
    [setAgentUpdating, setAgentVersion, addNotification, refreshAgentStatus],
  )

  return (
    <CollapsibleSection title="Agents" storageKey="agents">
      <div className="agent-strip">
        {AGENTS.map((agent) => {
          const installed = agentStatus[agent.id] === true
          const version = agentVersions[agent.id]
          const hasUpdate = version?.updateAvailable === true
          const updating = version?.updating === true

          let statusClass = 'off'
          let statusLabel = 'OFF'
          if (installed) {
            if (hasUpdate) {
              statusClass = 'upd'
              statusLabel = 'UPD'
            } else {
              statusClass = 'ok'
              statusLabel = 'OK'
            }
          }

          return (
            <button
              key={agent.id}
              className={`agent-chip-v2${installed ? ' installed' : ''}`}
              onClick={hasUpdate && !updating ? () => void handleUpdate(agent.id) : undefined}
              disabled={!hasUpdate || updating}
              type="button"
              title={
                hasUpdate
                  ? `Update ${agent.name}`
                  : installed
                    ? `${agent.name} installed`
                    : `${agent.name} not installed`
              }
              aria-label={`${agent.name} ${statusLabel}`}
            >
              <div className={`agent-chip-emoji${installed ? '' : ' dimmed'}`}>{agent.icon}</div>
              <div className="agent-chip-name">{agent.name}</div>
              {version?.current !== undefined && (
                <div className="agent-chip-ver">{version.current}</div>
              )}
              <div className={`agent-chip-badge ${statusClass}`}>{statusLabel}</div>
            </button>
          )
        })}
      </div>
    </CollapsibleSection>
  )
}
