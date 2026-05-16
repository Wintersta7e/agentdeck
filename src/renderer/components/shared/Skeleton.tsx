import './Skeleton.css'

interface SkeletonProps {
  /** Tailored shape — `line` is full-width text, `bar` is fixed-width, `block` is a card body. */
  variant?: 'line' | 'bar' | 'block'
  /** CSS width override (e.g. `"60%"`, `"120px"`). Ignored for `block`. */
  width?: string
  /** CSS height override (e.g. `"14px"`). */
  height?: string
  /** Optional aria-label for screen readers (defaults to "Loading"). */
  label?: string
  className?: string
}

/**
 * Animated placeholder for content that is still loading. Respects
 * `prefers-reduced-motion`: falls back to a solid tint without shimmer.
 */
export function Skeleton({
  variant = 'line',
  width,
  height,
  label = 'Loading',
  className,
}: SkeletonProps): React.JSX.Element {
  const style: React.CSSProperties = {}
  if (width) style.width = width
  if (height) style.height = height
  return (
    <span
      role="status"
      aria-label={label}
      aria-busy="true"
      className={`skeleton skeleton-${variant}${className ? ` ${className}` : ''}`}
      style={style}
    />
  )
}
