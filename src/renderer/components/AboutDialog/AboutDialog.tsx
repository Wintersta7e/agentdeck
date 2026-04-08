import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import './AboutDialog.css'

interface AboutDialogProps {
  onClose: () => void
}

interface VersionInfo {
  electron: string
  chrome: string
  node: string
}

export function AboutDialog({ onClose }: AboutDialogProps): React.JSX.Element {
  const trapRef = useFocusTrap<HTMLDivElement>()
  const [appVersion, setAppVersion] = useState('')
  const [versions, setVersions] = useState<VersionInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    window.agentDeck.app
      .version()
      .then((v) => {
        if (!cancelled) setAppVersion(v)
      })
      .catch((err: unknown) => {
        window.agentDeck.log.send('debug', 'about', 'Version fetch failed', { err: String(err) })
      })
    window.agentDeck.app
      .versions()
      .then((v) => {
        if (!cancelled) setVersions(v)
      })
      .catch((err: unknown) => {
        window.agentDeck.log.send('debug', 'about', 'Version fetch failed', { err: String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [])

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
    <div
      className="about-overlay"
      onClick={handleOverlayClick}
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-label="About AgentDeck"
    >
      <div className="about-dialog">
        <button className="about-close" onClick={onClose} aria-label="Close about dialog">
          <X size={16} />
        </button>
        <div className="about-name">AgentDeck</div>
        <div className="about-version">v{appVersion}</div>
        {versions && (
          <div className="about-versions">
            <div className="about-version-row">
              <span className="about-version-label">Electron</span>
              <span>{versions.electron}</span>
            </div>
            <div className="about-version-row">
              <span className="about-version-label">Chrome</span>
              <span>{versions.chrome}</span>
            </div>
            <div className="about-version-row">
              <span className="about-version-label">Node.js</span>
              <span>{versions.node}</span>
            </div>
          </div>
        )}
        <div className="about-copyright">{'\u00A9'} 2025 AgentDeck</div>
      </div>
    </div>
  )
}
