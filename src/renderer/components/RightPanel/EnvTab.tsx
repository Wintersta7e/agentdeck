import { memo, useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { AGENTS } from '../../../shared/agents'
import './EnvTab.css'

interface AgentPaths {
  claudeConfigDir: string | null
  codexHome: string | null
  agentdeckRoot: string
  templateUserRoot: string
}

/**
 * Strip the trailing `/.agentdeck` segment from `agentdeckRoot` so we can show
 * the bare WSL home directory. Returns an empty string when the input doesn't
 * follow the expected layout — surface as "unknown" upstream.
 */
function deriveWslHome(agentdeckRoot: string): string {
  if (!agentdeckRoot) return ''
  const suffix = '/.agentdeck'
  if (agentdeckRoot.endsWith(suffix)) {
    return agentdeckRoot.slice(0, -suffix.length)
  }
  return agentdeckRoot
}

export const EnvTab = memo(function EnvTab(): React.JSX.Element {
  const wslDistro = useAppStore((s) => s.wslDistro)
  const agentVersions = useAppStore((s) => s.agentVersions)
  const agentStatus = useAppStore((s) => s.agentStatus)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const activeProject = useAppStore((s) => {
    const id = s.activeSessionId
    if (!id) return null
    const projectId = s.sessions[id]?.projectId
    if (!projectId) return null
    return s.projects.find((p) => p.id === projectId) ?? null
  })

  const [paths, setPaths] = useState<AgentPaths | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.agentDeck.env
      .getAgentPaths()
      .then((result) => {
        if (cancelled) return
        setPaths(result)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        window.agentDeck.log.send('warn', 'env-tab', 'getAgentPaths failed', {
          err: String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (paths === null) {
    return <div className="env-tab__loading">Loading…</div>
  }

  const wslHome = deriveWslHome(paths.agentdeckRoot)
  const anyAgentDetected = Object.values(agentVersions).some((v) => Boolean(v.current))

  return (
    <div className="env-tab">
      <section className="env-tab__section">
        <h3 className="env-tab__title">Agent paths</h3>
        <dl className="env-tab__list">
          <Row label="CLAUDE_CONFIG_DIR" value={paths.claudeConfigDir ?? 'unset'} />
          <Row label="CODEX_HOME" value={paths.codexHome ?? 'unset'} />
          <Row label="agentdeckRoot" value={paths.agentdeckRoot} />
          <Row label="templateUserRoot" value={paths.templateUserRoot} />
        </dl>
      </section>

      <section className="env-tab__section">
        <h3 className="env-tab__title">WSL</h3>
        <dl className="env-tab__list">
          <Row label="WSL distro" value={wslDistro || 'not detected'} />
          <Row label="WSL home" value={wslHome || 'unknown'} />
        </dl>
      </section>

      <section className="env-tab__section">
        <h3 className="env-tab__title">Agent versions</h3>
        {!anyAgentDetected && Object.keys(agentStatus).length === 0 ? (
          <div className="env-tab__hint">Run agent detection from the Agents tab.</div>
        ) : (
          <dl className="env-tab__list">
            {AGENTS.map((agent) => {
              const info = agentVersions[agent.id]
              const value = info?.current ?? 'not detected'
              return <Row key={agent.id} label={agent.name} value={value} />
            })}
          </dl>
        )}
      </section>

      <section className="env-tab__section">
        <h3 className="env-tab__title">Active project</h3>
        {activeSessionId && activeProject ? (
          <dl className="env-tab__list">
            <Row label="Config" value={`${activeProject.path}/.agentdeck/`} />
            <Row label="Templates" value={`${activeProject.path}/.agentdeck/templates/`} />
            <Row
              label="Worktrees"
              value={
                wslHome ? `${wslHome}/.agentdeck/worktrees/` : '$WSL_HOME/.agentdeck/worktrees/'
              }
            />
          </dl>
        ) : (
          <div className="env-tab__hint">No active project.</div>
        )}
      </section>
    </div>
  )
})

interface RowProps {
  label: string
  value: string
}

function Row({ label, value }: RowProps): React.JSX.Element {
  return (
    <div className="env-tab__row">
      <dt className="env-tab__key">{label}</dt>
      <dd className="env-tab__val" title={value}>
        {value}
      </dd>
    </div>
  )
}
