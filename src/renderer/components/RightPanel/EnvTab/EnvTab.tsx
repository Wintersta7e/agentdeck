import { useEffect, useState, useCallback, useRef, memo } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAppStore } from '../../../store/appStore'
import type { AgentEnvSnapshot } from '../../../../shared/types'
import { AGENTS } from '../../../../shared/agents'
import { HooksSection } from './HooksSection'
import { SkillsSection } from './SkillsSection'
import { McpSection } from './McpSection'
import { ConfigSection } from './ConfigSection'
import { PathsSection } from './PathsSection'
import { FuturePlaceholder } from './FuturePlaceholder'
import './EnvTab.css'

/**
 * Per-agent environment snapshot for the active session. Resolves the agent via
 * `session.agentOverride ?? project.agent ?? 'claude-code'` and queries the
 * `env:getAgentSnapshot` IPC to build a hooks/skills/MCP/config view. The
 * "Paths" footer always renders (debug visibility) and a future-tier agent
 * (`gemini-cli`, `amazon-q`, `opencode`) gets a not-yet-supported placeholder
 * above the paths footer.
 */
export const EnvTab = memo(function EnvTab(): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const session = useAppStore((s) => (activeSessionId ? s.sessions[activeSessionId] : null))
  const project = useAppStore((s) =>
    session ? (s.projects.find((p) => p.id === session.projectId) ?? null) : null,
  )
  const agentVersions = useAppStore((s) => s.agentVersions)

  const agentId = (session?.agentOverride ?? project?.agent ?? 'claude-code') as string
  const agent = AGENTS.find((a) => a.id === agentId) ?? null
  const projectId = project?.id

  const [snapshot, setSnapshot] = useState<AgentEnvSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Monotonic request sequence — guards setSnapshot/setError/setLoading against
  // stale IPC responses when the user switches session/agent (or hits Refresh
  // again) before an in-flight request resolves. Same pattern FileTree uses
  // via `cancelled` in its useEffect.
  const reqSeqRef = useRef(0)

  const load = useCallback(
    (force: boolean): void => {
      if (!activeSessionId || !agent) return
      const seq = ++reqSeqRef.current
      // Nested async so react-hooks/set-state-in-effect doesn't flag the sync sets.
      const run = async (): Promise<void> => {
        setLoading(true)
        setError(null)
        try {
          const result = await window.agentDeck.env.getAgentSnapshot({
            agentId,
            ...(projectId ? { projectId } : {}),
            force,
          })
          if (reqSeqRef.current !== seq) return
          setSnapshot(result)
        } catch (err: unknown) {
          if (reqSeqRef.current !== seq) return
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          if (reqSeqRef.current === seq) setLoading(false)
        }
      }
      void run()
    },
    [activeSessionId, agent, agentId, projectId],
  )

  useEffect(() => {
    load(false)
    // Bump the sequence on cleanup so the previous-effect's in-flight call
    // can't race past the new effect's request. Capture the ref into a local
    // so the cleanup closure doesn't read a refreshed `reqSeqRef.current`
    // (it's the same object across renders, but the rule wants the explicit
    // capture for clarity).
    const seqRef = reqSeqRef
    return () => {
      seqRef.current++
    }
  }, [load])

  if (!activeSessionId || !session || !agent) {
    return <div className="ri-tab__empty">Open a session to see its agent&apos;s environment.</div>
  }
  if (error) {
    return <div className="env-tab__error">Failed to load environment: {error}</div>
  }
  if (!snapshot) {
    return <div className="env-tab__loading">Loading…</div>
  }

  const versionInfo = agentVersions[agentId]?.current ?? snapshot.agentVersion ?? 'unknown'

  return (
    <div className="env-tab">
      <header className="env-tab__header">
        <div className="env-tab__title-row">
          <span className="env-tab__agent-name">{agent.name}</span>
          <span className="env-tab__version">{versionInfo}</span>
        </div>
        <div className="env-tab__subtitle-row">
          <span className="env-tab__subtitle">as resolved for active session</span>
          <button
            type="button"
            aria-label="Refresh environment"
            className="env-tab__refresh"
            onClick={() => load(true)}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={12} aria-hidden="true" />
          </button>
        </div>
      </header>

      {snapshot.supportLevel === 'future' ? (
        <FuturePlaceholder agentName={agent.name} />
      ) : (
        <>
          <HooksSection hooks={snapshot.hooks} />
          <SkillsSection skills={snapshot.skills} />
          <McpSection servers={snapshot.mcpServers} />
          <ConfigSection config={snapshot.config} />
        </>
      )}
      <PathsSection paths={snapshot.paths} />
    </div>
  )
})
