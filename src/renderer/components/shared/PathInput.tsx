import './PathInput.css'

interface PathInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string | undefined
}

export function PathInput({ value, onChange, placeholder }: PathInputProps): React.JSX.Element {
  const handleBrowse = async (): Promise<void> => {
    const result = await window.agentDeck.pickFolder()
    if (result !== null) {
      onChange(result)
    }
  }

  return (
    <div className="path-input">
      <input
        type="text"
        className="path-input-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
      <button type="button" className="path-input-browse" onClick={handleBrowse}>
        Browse
      </button>
    </div>
  )
}
