import type { StackBadge } from '../../../shared/types'
import './StackBadgeSelector.css'

const ALL_BADGES: StackBadge[] = [
  'Java',
  'JS',
  'TS',
  'Python',
  'Rust',
  'Go',
  '.NET',
  'C/C++',
  'Ruby',
  'PHP',
  'Kotlin',
  'Swift',
  'Dart',
  'Agent',
  'Other',
]

interface StackBadgeSelectorProps {
  value: StackBadge
  onChange: (badge: StackBadge) => void
}

export function StackBadgeSelector({
  value,
  onChange,
}: StackBadgeSelectorProps): React.JSX.Element {
  return (
    <div className="badge-selector">
      {ALL_BADGES.map((badge) => (
        <button
          key={badge}
          type="button"
          className={`badge-pill${value === badge ? ' selected' : ''}`}
          data-badge={badge}
          onClick={() => onChange(badge)}
        >
          {badge}
        </button>
      ))}
    </div>
  )
}
