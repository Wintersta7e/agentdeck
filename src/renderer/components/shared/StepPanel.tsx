import './StepPanel.css'

interface StepPanelProps {
  steps: { name: string; desc: string }[]
  currentStep: number
  onGoTo: (step: number) => void
}

export function StepPanel({ steps, currentStep, onGoTo }: StepPanelProps): React.JSX.Element {
  return (
    <div className="step-panel-inner">
      <div className="step-panel-header">New Project</div>
      <div className="step-panel-sub">Set up a new agent workspace</div>
      <div className="step-list">
        {steps.map((step, index) => {
          const isDone = index < currentStep
          const isActive = index === currentStep
          const isLast = index === steps.length - 1

          const dotClass = isDone ? 'done' : isActive ? 'active' : ''
          const nameClass = isDone ? 'done' : isActive ? 'active' : ''
          const descClass = isActive ? 'active' : ''
          const connectorClass = isDone ? 'done' : ''

          return (
            <div
              key={index}
              className="step-row"
              onClick={() => onGoTo(index)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onGoTo(index)
                }
              }}
            >
              <div className="step-left">
                <div className={`step-dot ${dotClass}`}>{isDone ? '\u2713' : index + 1}</div>
                {!isLast && <div className={`step-connector ${connectorClass}`} />}
              </div>
              <div className="step-info">
                <div className={`step-name ${nameClass}`}>{step.name}</div>
                <div className={`step-desc ${descClass}`}>{step.desc}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
