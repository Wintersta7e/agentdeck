import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { PanelBox } from '../shared/PanelBox'
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
  const [appVersion, setAppVersion] = useState('')
  const [versions, setVersions] = useState<VersionInfo | null>(null)

  useEffect(() => {
    window.agentDeck.app
      .version()
      .then(setAppVersion)
      .catch(() => {})
    window.agentDeck.app
      .versions()
      .then(setVersions)
      .catch(() => {})
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
    <div className="about-overlay" onClick={handleOverlayClick}>
      <PanelBox corners="all" glow="none" className="about-dialog">
        <button className="about-close" onClick={onClose}>
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
      </PanelBox>
    </div>
  )
}
