import './PathInput.css'

interface PathInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string | undefined
  validate?: boolean | undefined
}

function isValidPath(path: string): boolean {
  if (!path.trim()) return true // empty is not invalid, just empty
  // WSL paths start with /
  if (path.startsWith('/')) return true
  // Windows paths (will be converted)
  if (/^[A-Za-z]:[/\\]/.test(path)) return true
  return false
}

export function PathInput({
  value,
  onChange,
  placeholder,
  validate = true,
}: PathInputProps): React.JSX.Element {
  const handleBrowse = async (): Promise<void> => {
    const result = await window.agentDeck.pickFolder()
    if (result !== null) {
      onChange(result)
    }
  }

  const showError = validate && value.trim().length > 0 && !isValidPath(value)

  return (
    <div className="path-input">
      <input
        type="text"
        className={`path-input-field${showError ? ' path-input-error' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder ?? 'Path input'}
        spellCheck={false}
      />
      <button type="button" className="path-input-browse" onClick={handleBrowse}>
        Browse
      </button>
      {showError && (
        <div className="path-input-hint">Path should start with / (WSL) or C:\ (Windows)</div>
      )}
    </div>
  )
}
