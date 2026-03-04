import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchAddon } from '@xterm/addon-search'
import './TerminalSearchBar.css'

interface TerminalSearchBarProps {
  searchAddon: SearchAddon
  visible: boolean
  onClose: () => void
}

const DECO_OPTIONS = {
  matchBackground: 'rgba(245,166,35,0.15)',
  matchBorder: 'rgba(245,166,35,0.25)',
  matchOverviewRuler: 'rgba(245,166,35,0.5)',
  activeMatchBackground: 'rgba(245,166,35,0.35)',
  activeMatchBorder: '#f5a623',
  activeMatchColorOverviewRuler: '#f5a623',
}

export function TerminalSearchBar({ searchAddon, visible, onClose }: TerminalSearchBarProps) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [resultIndex, setResultIndex] = useState(-1)
  const [resultCount, setResultCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryRef = useRef(query)

  // Subscribe to result changes
  useEffect(() => {
    const disposable = searchAddon.onDidChangeResults(
      (e: { resultIndex: number; resultCount: number }) => {
        setResultIndex(e.resultIndex)
        setResultCount(e.resultCount)
      },
    )
    return () => disposable.dispose()
  }, [searchAddon])

  // Auto-focus input when becoming visible
  useEffect(() => {
    if (visible) inputRef.current?.focus()
  }, [visible])

  const searchOptions = useCallback(
    () => ({
      regex,
      caseSensitive,
      wholeWord,
      incremental: true,
      decorations: DECO_OPTIONS,
    }),
    [regex, caseSensitive, wholeWord],
  )

  /** Build search options with explicit overrides (for use in toggle handlers before state updates). */
  const buildSearchOptions = (overrides: {
    regex?: boolean
    caseSensitive?: boolean
    wholeWord?: boolean
  }) => ({
    regex: overrides.regex ?? regex,
    caseSensitive: overrides.caseSensitive ?? caseSensitive,
    wholeWord: overrides.wholeWord ?? wholeWord,
    incremental: true,
    decorations: DECO_OPTIONS,
  })

  const doSearch = useCallback(
    (q: string) => {
      if (!q) {
        searchAddon.clearDecorations()
        setResultIndex(-1)
        setResultCount(0)
        return
      }
      searchAddon.findNext(q, searchOptions())
    },
    [searchAddon, searchOptions],
  )

  /** Re-search with explicit option overrides (avoids setState-in-useEffect). */
  const reSearchWithOptions = (overrides: {
    regex?: boolean
    caseSensitive?: boolean
    wholeWord?: boolean
  }) => {
    const q = queryRef.current
    if (q) searchAddon.findNext(q, buildSearchOptions(overrides))
  }

  const handleChange = (value: string) => {
    setQuery(value)
    queryRef.current = value
    doSearch(value)
  }

  const toggleCaseSensitive = () => {
    const next = !caseSensitive
    setCaseSensitive(next)
    reSearchWithOptions({ caseSensitive: next })
  }

  const toggleWholeWord = () => {
    const next = !wholeWord
    setWholeWord(next)
    reSearchWithOptions({ wholeWord: next })
  }

  const toggleRegex = () => {
    const next = !regex
    setRegex(next)
    reSearchWithOptions({ regex: next })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      searchAddon.clearDecorations()
      onClose()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        searchAddon.findPrevious(query, searchOptions())
      } else {
        searchAddon.findNext(query, searchOptions())
      }
      return
    }
    // Alt shortcuts
    if (e.altKey) {
      if (e.key === 'r') {
        e.preventDefault()
        toggleRegex()
      } else if (e.key === 'c') {
        e.preventDefault()
        toggleCaseSensitive()
      } else if (e.key === 'w') {
        e.preventDefault()
        toggleWholeWord()
      }
    }
  }

  if (!visible) return null

  const noResults = query.length > 0 && resultCount === 0
  const hasResults = resultCount > 0

  return (
    <div className="term-search-bar">
      <input
        ref={inputRef}
        className={`term-search-input${noResults ? ' no-results' : ''}`}
        type="text"
        placeholder="Find..."
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <span
        className={`term-search-count${hasResults ? ' has-results' : ''}${noResults ? ' no-results' : ''}`}
      >
        {noResults ? 'No results' : hasResults ? `${resultIndex + 1} of ${resultCount}` : ''}
      </span>
      <div className="term-search-sep" />
      <button
        className={`term-search-toggle${caseSensitive ? ' active' : ''}`}
        title="Match Case (Alt+C)"
        onClick={toggleCaseSensitive}
      >
        Aa
      </button>
      <button
        className={`term-search-toggle${wholeWord ? ' active' : ''}`}
        title="Whole Word (Alt+W)"
        onClick={toggleWholeWord}
      >
        ab
      </button>
      <button
        className={`term-search-toggle${regex ? ' active' : ''}`}
        title="Use Regex (Alt+R)"
        onClick={toggleRegex}
      >
        .*
      </button>
      <div className="term-search-sep" />
      <button
        className="term-search-nav"
        title="Previous Match (Shift+Enter)"
        disabled={!hasResults}
        onClick={() => searchAddon.findPrevious(query, searchOptions())}
      >
        &#9650;
      </button>
      <button
        className="term-search-nav"
        title="Next Match (Enter)"
        disabled={!hasResults}
        onClick={() => searchAddon.findNext(query, searchOptions())}
      >
        &#9660;
      </button>
      <div className="term-search-sep" />
      <button
        className="term-search-close"
        title="Close (Esc)"
        onClick={() => {
          searchAddon.clearDecorations()
          onClose()
        }}
      >
        &times;
      </button>
    </div>
  )
}
