import { useMemo } from 'react'
import { CollapsibleSection } from '../shared/CollapsibleSection'
import { useCostHistory } from '../../hooks/useCostHistory'
import { AGENTS } from '../../../shared/agents'
import './CostDashboard.css'

const AGENT_META = new Map<string, (typeof AGENTS)[number]>(AGENTS.map((a) => [a.id, a]))

// Inner component — only mounted when CollapsibleSection is open, so the hook
// only runs when the section is actually visible.
function CostDashboardContent(): React.JSX.Element {
  const { todayCost, perAgentToday, budget, history } = useCostHistory()

  const topAgents = useMemo(
    () =>
      Object.entries(perAgentToday)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3),
    [perAgentToday],
  )

  const budgetPct = budget !== null && budget > 0 ? Math.min(100, (todayCost / budget) * 100) : 0
  const budgetWarning = budget !== null && budgetPct >= 80

  return (
    <div className="cost-grid">
      <div className={`cost-card${budgetWarning ? ' warning' : ''}`}>
        <div className="cost-val cost-accent">${todayCost.toFixed(2)}</div>
        <div className="cost-lbl">Total</div>
        {budget !== null && (
          <>
            <div className="cost-bar">
              <div
                className={`cost-fill${budgetPct >= 100 ? ' over' : ''}`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <div className="cost-budget-labels">
              <span>$0</span>
              <span>${budget.toFixed(2)} budget</span>
            </div>
          </>
        )}
      </div>

      {topAgents.map(([agentId, cost]) => {
        const meta = AGENT_META.get(agentId)
        const agentHistory = history.map((h) => h.perAgent[agentId] ?? 0)
        // Stack-safe max: spread of a large array can exceed JS arg limits
        const maxVal = agentHistory.reduce((m, v) => (v > m ? v : m), 0.01)

        return (
          <div key={agentId} className="cost-card">
            <div className="cost-val">${cost.toFixed(2)}</div>
            <div className="cost-lbl">{meta?.name ?? agentId}</div>
            {agentHistory.length > 0 && (
              <div className="cost-sparkline">
                {agentHistory.map((val, i) => (
                  <div
                    key={i}
                    className="cost-spark-bar"
                    style={{
                      height: `${(val / maxVal) * 24}px`,
                      opacity: 0.15 + (val / maxVal) * 0.35,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {topAgents.length === 0 && (
        <div className="cost-card">
          <div className="cost-val cost-dim">$0.00</div>
          <div className="cost-lbl">No cost data</div>
        </div>
      )}
    </div>
  )
}

export function CostDashboard(): React.JSX.Element {
  return (
    <CollapsibleSection title="Cost Tracking — Today" storageKey="cost">
      <CostDashboardContent />
    </CollapsibleSection>
  )
}
