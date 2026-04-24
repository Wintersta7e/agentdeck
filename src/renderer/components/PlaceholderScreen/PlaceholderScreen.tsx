import './PlaceholderScreen.css'

interface PlaceholderScreenProps {
  title: string
  subtitle?: string
  phase?: string
}

/**
 * Temporary placeholder for redesign tab views that haven't been ported yet.
 * Replaced phase-by-phase as Phase 3 screens land.
 */
export function PlaceholderScreen({
  title,
  subtitle,
  phase,
}: PlaceholderScreenProps): React.JSX.Element {
  return (
    <div className="placeholder-screen" role="region" aria-label={title}>
      <div className="placeholder-screen__chrome">
        {phase && <div className="placeholder-screen__eyebrow">{phase}</div>}
        <h1 className="placeholder-screen__title">{title}</h1>
        {subtitle && <p className="placeholder-screen__subtitle">{subtitle}</p>}
        <div className="placeholder-screen__grid" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="placeholder-screen__footer">
          Under construction. Shipping in the redesign port.
        </p>
      </div>
    </div>
  )
}
