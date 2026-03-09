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

const BADGE_COLORS: Record<StackBadge, string> = {
  Java: '#e55934',
  JS: '#f0db4f',
  TS: '#3178c6',
  Python: '#3572a5',
  Rust: '#dea584',
  Go: '#00add8',
  '.NET': '#512bd4',
  'C/C++': '#00599c',
  Ruby: '#cc342d',
  PHP: '#777bb4',
  Kotlin: '#7f52ff',
  Swift: '#f05138',
  Dart: '#01a7dc',
  Agent: 'var(--amber)',
  Other: 'var(--text2)',
}

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
      {ALL_BADGES.map((badge) => {
        const isSelected = value === badge
        const color = BADGE_COLORS[badge]
        return (
          <button
            key={badge}
            type="button"
            className={`badge-pill ${isSelected ? 'selected' : ''}`}
            style={
              isSelected
                ? { borderColor: color, background: color, color: badge === 'JS' ? '#000' : '#fff' }
                : undefined
            }
            onClick={() => onChange(badge)}
          >
            {badge}
          </button>
        )
      })}
    </div>
  )
}
