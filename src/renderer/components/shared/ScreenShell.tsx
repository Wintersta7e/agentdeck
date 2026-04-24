import type { ReactNode } from 'react'
import './ScreenShell.css'

interface ScreenShellProps {
  /** Small uppercase category label above the title. */
  eyebrow?: string
  /** Screen title (hero text). */
  title: string
  /** Descriptive subtitle below the title. */
  sub?: string
  /** Actions rendered on the right of the header row (e.g. "+ New"). */
  actions?: ReactNode
  /** Filter chips row under the header. */
  filters?: ReactNode
  /** Screen body. */
  children: ReactNode
  /** Optional extra class for layout/sizing tweaks. */
  className?: string
}

/**
 * Shared screen chrome for redesign tab views: eyebrow + title + sub on
 * the left, actions on the right, optional filter-chip row below, then
 * children. Padding, gaps, typography all driven by tokens.
 */
export function ScreenShell({
  eyebrow,
  title,
  sub,
  actions,
  filters,
  children,
  className,
}: ScreenShellProps): React.JSX.Element {
  return (
    <div className={`screen-shell${className ? ` ${className}` : ''}`}>
      <header className="screen-shell__header">
        <div className="screen-shell__head-left">
          {eyebrow && <div className="screen-shell__eyebrow">{eyebrow}</div>}
          <h1 className="screen-shell__title">{title}</h1>
          {sub && <p className="screen-shell__sub">{sub}</p>}
        </div>
        {actions && <div className="screen-shell__actions">{actions}</div>}
      </header>
      {filters && <div className="screen-shell__filters">{filters}</div>}
      <div className="screen-shell__body">{children}</div>
    </div>
  )
}

interface FilterChipProps {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  /** Numeric count shown after the label. */
  count?: number
  /** Optional leading dot color (for state markers). */
  dotColor?: 'green' | 'red' | 'accent' | 'text3'
  disabled?: boolean
  title?: string
}

export function FilterChip({
  active,
  onClick,
  children,
  count,
  dotColor,
  disabled,
  title,
}: FilterChipProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={`filter-chip${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={title}
    >
      {dotColor && <span className={`filter-chip__dot filter-chip__dot--${dotColor}`} />}
      <span className="filter-chip__label">{children}</span>
      {count !== undefined && <span className="filter-chip__count">· {count}</span>}
    </button>
  )
}
