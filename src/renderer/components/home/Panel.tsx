import type { ReactNode } from 'react'
import './Panel.css'

interface PanelProps {
  /** Title shown in the panel header, uppercase. */
  title: string
  /** Optional subtitle on the right of the header. */
  sub?: string | undefined
  /** Optional action button slot on the right side of the header. */
  action?: ReactNode
  /** Panel body. */
  children: ReactNode
  /** Extra class for layout or sizing tweaks. */
  className?: string
  /** Optional aria-label override; defaults to title. */
  label?: string
}

/**
 * Redesign panel chrome — bordered frame with 4 corner ticks,
 * uppercase title row, dotted divider, and optional trailing subtitle.
 * Inspired by B1Panel in the prototype. Theme-aware via CSS tokens.
 */
export function Panel({
  title,
  sub,
  action,
  children,
  className,
  label,
}: PanelProps): React.JSX.Element {
  return (
    <section className={`rd-panel${className ? ` ${className}` : ''}`} aria-label={label ?? title}>
      <span className="rd-panel__tick rd-panel__tick--tl" aria-hidden="true" />
      <span className="rd-panel__tick rd-panel__tick--tr" aria-hidden="true" />
      <span className="rd-panel__tick rd-panel__tick--bl" aria-hidden="true" />
      <span className="rd-panel__tick rd-panel__tick--br" aria-hidden="true" />
      <header className="rd-panel__head">
        <span className="rd-panel__title">{title}</span>
        <span className="rd-panel__divider" aria-hidden="true" />
        {sub && <span className="rd-panel__sub">{sub}</span>}
        {action && <span className="rd-panel__action">{action}</span>}
      </header>
      <div className="rd-panel__body">{children}</div>
    </section>
  )
}
