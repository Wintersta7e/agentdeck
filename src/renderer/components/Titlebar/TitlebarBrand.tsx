import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { formatClock, formatWeekday } from '../../utils/format-date'
import './TitlebarBrand.css'

/**
 * B1-style brand strip sitting inside the Titlebar.
 *
 * Search pill (click → Ctrl+K command palette), live indicator that
 * reflects the session mix (running / error / idle), clock ticking every
 * 30 s, READY status word, and a "UBUNTU · WSL · vX.Y.Z" trailing chip
 * (version pulled live from the main process, never hardcoded).
 * Every element reads from the store so it reflects real state.
 */
export function TitlebarBrand(): React.JSX.Element {
  const runningCount = useAppStore(
    (s) => Object.values(s.sessions).filter((sess) => sess.status === 'running').length,
  )
  const errorCount = useAppStore(
    (s) => Object.values(s.sessions).filter((sess) => sess.status === 'error').length,
  )
  const distro = useAppStore((s) => s.wslDistro)
  const wslAvailable = useAppStore((s) => s.wslAvailable)
  const openCommandPalette = useAppStore((s) => s.openCommandPalette)
  const username = useAppStore((s) => s.wslUsername)

  const [clock, setClock] = useState(() => formatClock(new Date()))
  const [day, setDay] = useState(() => formatWeekday(new Date()))
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date()
      setClock(formatClock(d))
      setDay(formatWeekday(d))
    }, 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    window.agentDeck.app
      .version()
      .then((v: string) => {
        if (!cancelled) setAppVersion(v)
      })
      .catch(() => {
        /* leave the chip versionless if IPC fails — not load-bearing */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const state: 'error' | 'running' | 'idle' =
    errorCount > 0 ? 'error' : runningCount > 0 ? 'running' : 'idle'

  const stateLabel = state === 'error' ? 'ERROR' : state === 'running' ? 'LIVE' : 'IDLE'
  const statusWord = wslAvailable === false ? 'WSL DOWN' : state === 'error' ? 'ATTENTION' : 'READY'

  return (
    <div className="titlebar-brand">
      <div
        className="titlebar-brand__ident"
        title={username ? `signed in as ${username}` : undefined}
      >
        <span className="titlebar-brand__ident-label">AGENTDECK</span>
        {username && (
          <span className="titlebar-brand__ident-user">
            <span className="titlebar-brand__ident-sep">/</span>
            {username}
          </span>
        )}
      </div>

      <button
        type="button"
        className="titlebar-brand__search"
        onClick={() => openCommandPalette()}
        aria-label="Open command palette"
        title="Search sessions, projects, agents… (Ctrl+K)"
      >
        <Search size={12} />
        <span className="titlebar-brand__search-label">Search sessions, projects, agents…</span>
        <span className="titlebar-brand__search-kbd">Ctrl+K</span>
      </button>

      <div className={`titlebar-brand__live titlebar-brand__live--${state}`}>
        <span className="titlebar-brand__live-dot" aria-hidden="true" />
        {stateLabel}
        {runningCount > 0 && <span className="titlebar-brand__live-count"> · {runningCount}</span>}
      </div>

      <div className="titlebar-brand__clock">
        <span className="titlebar-brand__clock-day">{day}</span>
        <span className="titlebar-brand__clock-digits">{clock}</span>
      </div>

      <div
        className={`titlebar-brand__status titlebar-brand__status--${state}${wslAvailable === false ? ' titlebar-brand__status--warn' : ''}`}
      >
        {statusWord}
      </div>

      <div className="titlebar-brand__system" aria-hidden="true">
        {(distro || 'UBUNTU').toUpperCase()} · WSL
        {appVersion && (
          <>
            {' · '}
            <span>v{appVersion}</span>
          </>
        )}
      </div>
    </div>
  )
}
