import './Toggle.css'

interface ToggleProps {
  value: boolean
  onChange: (value: boolean) => void
  label?: string | undefined
}

export function Toggle({ value, onChange, label }: ToggleProps): React.JSX.Element {
  return (
    <label className="toggle-wrapper">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        className={`toggle ${value ? 'toggle-on' : ''}`}
        onClick={() => onChange(!value)}
      >
        <span className="toggle-thumb" />
      </button>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  )
}
