import { CollapsibleSection } from '../shared/CollapsibleSection'
import { useCostHistory } from '../../hooks/useCostHistory'
import { AGENTS } from '../../../shared/agents'
import './CostDashboard.css'

export function CostDashboard(): React.JSX.Element {
  const { todayCost, perAgentToday, budget, history } = useCostHistory()

  const topAgents = Object.entries(perAgentToday)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)

  const budgetPct = budget !== null && budget > 0 ? Math.min(100, (todayCost / budget) * 100) : 0
  const budgetWarning = budget !== null && budgetPct >= 80

  return (
    <CollapsibleSection title="Cost Tracking — Today" storageKey="cost">
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
          const meta = AGENTS.find((a) => a.id === agentId)
          const agentHistory = history.map((h) => h.perAgent[agentId] ?? 0)
          const maxVal = Math.max(...agentHistory, 0.01)

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
    </CollapsibleSection>
  )
}
