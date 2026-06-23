import { usePlanLimits, resolveWindow, type ResolvedWindow } from '../../hooks/usePlanLimits'
import { selectAgentMeta } from '../../utils/agent-ui'
import { useAgentRegistry } from '../../hooks/useAgentRegistry'
import { formatDuration } from '../../utils/format-duration'
import './PlanLimitsPanel.css'

function formatResetIn(sec: number): string {
  if (sec <= 0) return 'resets now'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `resets in ${h}h ${m}m` : `resets in ${m}m`
}

function Gauge({ label, w }: { label: string; w: ResolvedWindow }): React.JSX.Element {
  const pct = Math.min(100, Math.max(0, w.usedPercent))
  return (
    <div className="plan-gauge">
      <div className="plan-gauge__head">
        <span className="plan-gauge__label">{label}</span>
        <span className="plan-gauge__pct">{Math.round(pct)}%</span>
      </div>
      <div className="plan-gauge__track">
        <span
          className={`plan-gauge__fill${pct >= 80 ? ' plan-gauge__fill--warn' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="plan-gauge__sub">{formatResetIn(w.resetsInSec)}</span>
    </div>
  )
}

export function PlanLimitsPanel(): React.JSX.Element {
  const { codex, activity } = usePlanLimits()
  const registry = useAgentRegistry()
  // render-time snapshot (see usePlanLimits for the convention)
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const primary = resolveWindow(codex?.primary ?? null, now)
  const weekly = resolveWindow(codex?.weekly ?? null, now)
  const codexGaugesShown = primary !== null || weekly !== null

  // When Codex gauges are visible, skip Codex from the activity rows (no duplication).
  const activityRows = codexGaugesShown ? activity.filter((a) => a.agent !== 'codex') : activity

  const isEmpty = !codexGaugesShown && activityRows.length === 0

  return (
    <div className="plan-limits">
      {/* Codex gauges block */}
      {codexGaugesShown && (
        <div className="plan-limits__agent">
          <span className="plan-limits__agent-name">
            Codex{codex?.planType ? ` · ${codex.planType}` : ''}
          </span>
          <div className="plan-limits__gauges">
            {primary && <Gauge label="5-hour" w={primary} />}
            {weekly && <Gauge label="weekly" w={weekly} />}
          </div>
        </div>
      )}

      {/* Per-agent activity tiles */}
      {activityRows.map(({ agent, sessions, activeMs }) => {
        const meta = selectAgentMeta(registry, agent)
        const icon = meta.icon
        const name = meta.name
        return (
          <div key={agent} className="plan-limits__agent">
            <span className="plan-limits__agent-name plan-limits__agent-name--row">
              {icon && (
                <span className="plan-limits__agent-icon" aria-hidden="true">
                  {icon}
                </span>
              )}
              {name}
            </span>
            <span className="plan-limits__activity">
              {sessions} session{sessions === 1 ? '' : 's'} · {formatDuration(activeMs)} · last 5h
            </span>
          </div>
        )
      })}

      {/* Caveat note */}
      {!isEmpty && (
        <span className="plan-limits__note">
          Only Codex exposes plan limits; others show recent activity.
        </span>
      )}

      {/* Empty state */}
      {isEmpty && <span className="plan-limits__empty">No recent agent activity.</span>}
    </div>
  )
}
