import { useCallback, useState } from 'react'
import { X } from 'lucide-react'
import { useSuggestions, dismissSuggestion } from '../../hooks/useSuggestions'
import './SuggestionsPanel.css'

export function SuggestionsPanel(): React.JSX.Element {
  const suggestions = useSuggestions()
  // Toggle to force re-render after dismiss (localStorage changes don't trigger useMemo)
  const [, setDismissCount] = useState(0)

  const handleDismiss = useCallback((key: string) => {
    dismissSuggestion(key)
    setDismissCount((n) => n + 1)
  }, [])

  return (
    <div className="suggestions-panel">
      <div className="panel-header">{'\uD83D\uDCA1'} Suggestions</div>
      {suggestions.length === 0 ? (
        <div className="panel-empty">All clear — nothing needs attention.</div>
      ) : (
        suggestions.map((s) => (
          <div key={s.id} className="suggestion-item">
            <span className="suggestion-icon">{s.icon}</span>
            <div className="suggestion-body">
              <div className="suggestion-text">{s.text}</div>
              <div className="suggestion-action">{s.actionLabel} &rarr;</div>
            </div>
            <button
              className="suggestion-dismiss"
              onClick={() => handleDismiss(s.dismissKey)}
              aria-label="Dismiss suggestion"
              type="button"
            >
              <X size={12} />
            </button>
          </div>
        ))
      )}
    </div>
  )
}
