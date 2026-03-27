import { useCallback, useEffect } from 'react'
import { X } from 'lucide-react'
import { PanelBox } from '../shared/PanelBox'
import './ShortcutsDialog.css'

interface ShortcutsDialogProps {
  onClose: () => void
}

interface Shortcut {
  keys: string
  action: string
}

interface ShortcutSection {
  title: string
  shortcuts: Shortcut[]
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Global',
    shortcuts: [
      { keys: 'Ctrl+K', action: 'Command Palette' },
      { keys: 'Escape', action: 'Command Palette (from session)' },
      { keys: 'Ctrl+N', action: 'New Project' },
      { keys: 'Ctrl+T', action: 'New Terminal' },
      { keys: 'Ctrl+B', action: 'Toggle Sidebar' },
      { keys: 'Ctrl+\\', action: 'Toggle Right Panel' },
      { keys: 'Ctrl+/', action: 'Keyboard Shortcuts' },
      { keys: 'Ctrl+1 / 2 / 3', action: 'Pane Layout' },
      { keys: 'Ctrl++ / -', action: 'Zoom In / Out' },
      { keys: 'Ctrl+0', action: 'Reset Zoom' },
    ],
  },
  {
    title: 'Terminal',
    shortcuts: [
      { keys: 'Ctrl+Shift+F', action: 'Search in Terminal' },
      { keys: 'Ctrl+Shift+C', action: 'Copy Selection' },
      { keys: 'Ctrl+V', action: 'Paste' },
    ],
  },
  {
    title: 'Search Bar',
    shortcuts: [
      { keys: 'Enter', action: 'Next Match' },
      { keys: 'Shift+Enter', action: 'Previous Match' },
      { keys: 'Alt+R', action: 'Toggle Regex' },
      { keys: 'Alt+C', action: 'Toggle Case Sensitive' },
      { keys: 'Alt+W', action: 'Toggle Whole Word' },
      { keys: 'Escape', action: 'Close Search' },
    ],
  },
  {
    title: 'Command Palette',
    shortcuts: [
      { keys: '\u2191 \u2193', action: 'Navigate Items' },
      { keys: 'Enter', action: 'Execute Selected' },
      { keys: 'Space', action: 'Toggle (in agent list)' },
      { keys: 'Escape', action: 'Close / Back' },
    ],
  },
  {
    title: 'Editors',
    shortcuts: [
      { keys: 'Ctrl+S', action: 'Save Template' },
      { keys: 'Delete', action: 'Delete Template' },
      { keys: 'Enter', action: 'Commit Node / Rename Edit' },
      { keys: 'Shift+Enter', action: 'Newline in Node Edit' },
      { keys: 'Escape', action: 'Cancel Edit / Close Dialog' },
    ],
  },
]

export function ShortcutsDialog({ onClose }: ShortcutsDialogProps): React.JSX.Element {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  return (
    <div className="shortcuts-overlay" onClick={handleOverlayClick}>
      <PanelBox corners="all" glow="none" className="shortcuts-dialog">
        <button className="shortcuts-close" onClick={onClose} aria-label="Close shortcuts dialog">
          <X size={16} />
        </button>
        <div className="shortcuts-title">Keyboard Shortcuts</div>
        <div className="shortcuts-grid">
          {SHORTCUT_SECTIONS.map((section) => (
            <div key={section.title} className="shortcuts-section">
              <div className="shortcuts-section-title">{section.title}</div>
              {section.shortcuts.map((s) => (
                <div key={s.keys + s.action} className="shortcuts-row">
                  <kbd className="shortcuts-kbd">{s.keys}</kbd>
                  <span className="shortcuts-action">{s.action}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </PanelBox>
    </div>
  )
}
