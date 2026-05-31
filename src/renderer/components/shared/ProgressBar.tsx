import './ProgressBar.css'

interface ProgressBarProps {
  /**
   * Progress value 0..1. Omit (or pass `undefined`) to render an
   * indeterminate animated bar — useful when the operation has no
   * progress feed (npm install, network refresh, etc.).
   */
  value?: number | undefined
  /** ARIA label describing what's loading. */
  label: string
  /** Visual tone — defaults to `accent`; pass `green` for "running OK" semantics. */
  tone?: 'accent' | 'green'
  /** Height in CSS units (e.g. `"3px"`). Defaults to 2px. */
  height?: string
  className?: string
}

export function ProgressBar({
  value,
  label,
  tone = 'accent',
  height,
  className,
}: ProgressBarProps): React.JSX.Element {
  const isIndeterminate = value === undefined
  const clamped = isIndeterminate ? 0 : Math.max(0, Math.min(1, value))
  const fillStyle: React.CSSProperties = isIndeterminate ? {} : { transform: `scaleX(${clamped})` }
  const trackStyle: React.CSSProperties = height ? { height } : {}
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={isIndeterminate ? undefined : clamped}
      className={`progress-bar progress-tone-${tone}${isIndeterminate ? ' is-indeterminate' : ''}${className ? ` ${className}` : ''}`}
      style={trackStyle}
    >
      <div className="progress-bar-fill" style={fillStyle} />
    </div>
  )
}
