import { useCodexLimits, resolveWindow, type ResolvedWindow } from '../../hooks/useCodexLimits'
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
  const { codex, claude } = useCodexLimits()
  // render-time snapshot (see useCodexLimits for the convention)
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const primary = resolveWindow(codex?.primary ?? null, now)
  const weekly = resolveWindow(codex?.weekly ?? null, now)

  return (
    <div className="plan-limits">
      <div className="plan-limits__agent">
        <span className="plan-limits__agent-name">
          Codex{codex?.planType ? ` · ${codex.planType}` : ''}
        </span>
        {primary || weekly ? (
          <div className="plan-limits__gauges">
            {primary && <Gauge label="5-hour" w={primary} />}
            {weekly && <Gauge label="weekly" w={weekly} />}
          </div>
        ) : (
          <span className="plan-limits__empty">No recent Codex usage.</span>
        )}
      </div>

      <div className="plan-limits__agent">
        <span className="plan-limits__agent-name">Claude</span>
        <span className="plan-limits__claude">
          {claude.sessions} session{claude.sessions === 1 ? '' : 's'} ·{' '}
          {formatDuration(claude.activeMs)} · last 5h
        </span>
        <span className="plan-limits__note">Claude doesn&apos;t expose plan limits.</span>
      </div>
    </div>
  )
}
