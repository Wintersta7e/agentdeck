import { useCallback, useEffect, useRef } from 'react'

interface TerminalContextMenuProps {
  x: number
  y: number
  hasSelection: boolean
  sessionId: string
  onCopy: () => void
  onPaste: () => void
  onSelectAll: () => void
  onClear: () => void
  onSearch: () => void
  onClose: () => void
}

export function TerminalContextMenu({
  x,
  y,
  hasSelection,
  sessionId,
  onCopy,
  onPaste,
  onSelectAll,
  onClear,
  onSearch,
  onClose,
}: TerminalContextMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const handle = useCallback(
    (action: () => void) => () => {
      onClose()
      action()
    },
    [onClose],
  )

  return (
    <div
      ref={menuRef}
      className="term-context-menu"
      style={{ top: y, left: x }}
      role="menu"
      aria-label={`Terminal context menu for session ${sessionId}`}
    >
      <button className="term-ctx-item" disabled={!hasSelection} onClick={handle(onCopy)}>
        Copy
        <span className="term-ctx-hint">Ctrl+Shift+C</span>
      </button>
      <button className="term-ctx-item" onClick={handle(onPaste)}>
        Paste
        <span className="term-ctx-hint">Ctrl+V</span>
      </button>
      <button className="term-ctx-item" onClick={handle(onSelectAll)}>
        Select All
      </button>
      <div className="term-ctx-sep" />
      <button className="term-ctx-item" onClick={handle(onClear)}>
        Clear Scrollback
      </button>
      <div className="term-ctx-sep" />
      <button className="term-ctx-item" onClick={handle(onSearch)}>
        Search
        <span className="term-ctx-hint">Ctrl+Shift+F</span>
      </button>
    </div>
  )
}
