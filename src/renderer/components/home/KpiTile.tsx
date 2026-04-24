import './KpiTile.css'

export type KpiTone = 'accent' | 'green' | 'red' | 'blue' | 'purple'

interface KpiTileProps {
  label: string
  value: string
  sub?: string
  tone?: KpiTone
}

/**
 * Small density-dense stat tile used in the Home hero KPI strip.
 * Label (uppercase meta) · Large tabular-nums value · small caption.
 * Right-edge accent bar colors the tile by tone.
 */
export function KpiTile({ label, value, sub, tone = 'accent' }: KpiTileProps): React.JSX.Element {
  return (
    <div className={`kpi-tile kpi-tile--${tone}`} role="group" aria-label={label}>
      <div className="kpi-tile__label">{label}</div>
      <div className="kpi-tile__value">{value}</div>
      {sub && <div className="kpi-tile__sub">{sub}</div>}
      <span className="kpi-tile__bar" aria-hidden="true" />
    </div>
  )
}
