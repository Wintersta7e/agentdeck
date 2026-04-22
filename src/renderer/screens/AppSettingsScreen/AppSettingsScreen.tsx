import { useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { THEME_GROUPS, applyThemeWithTransition } from '../../components/CommandPalette/themeUtils'
import { ScreenShell } from '../../components/shared/ScreenShell'
import './AppSettingsScreen.css'

export function AppSettingsScreen(): React.JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const zoomFactor = useAppStore((s) => s.zoomFactor)

  const handlePickTheme = useCallback(
    (id: string) => {
      applyThemeWithTransition(id, () => setTheme(id))
    },
    [setTheme],
  )

  const handleResetZoom = useCallback(() => {
    window.agentDeck.zoom
      .reset()
      .then((z) => useAppStore.getState().setZoomFactor(z))
      .catch(() => {
        /* ignore */
      })
  }, [])

  return (
    <ScreenShell
      eyebrow="Preferences"
      title="Settings"
      sub="Global appearance and behavior. Project-level settings live inside each project."
      className="app-settings-screen"
    >
      <section className="app-settings-block" aria-labelledby="settings-theme">
        <header className="app-settings-block__head">
          <h2 id="settings-theme" className="app-settings-block__title">
            Theme
          </h2>
          <p className="app-settings-block__sub">
            Pick a palette. Redesign themes ship with Space Grotesk for display type.
          </p>
        </header>
        {THEME_GROUPS.map((group) => (
          <div key={group.label} className="app-settings-theme-group">
            <div className="app-settings-theme-group__label">{group.label}</div>
            <div className="app-settings-theme-grid">
              {group.themes.map((option) => {
                const active = option.id === theme
                return (
                  <button
                    key={option.id || '__default'}
                    type="button"
                    className={`app-settings-theme-card${active ? ' is-active' : ''}`}
                    onClick={() => handlePickTheme(option.id)}
                    aria-pressed={active}
                  >
                    <span
                      className="app-settings-theme-card__swatch"
                      style={{ background: option.accent }}
                      aria-hidden="true"
                    />
                    <span className="app-settings-theme-card__label">{option.label}</span>
                    {active && <span className="app-settings-theme-card__check">ACTIVE</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="app-settings-block" aria-labelledby="settings-zoom">
        <header className="app-settings-block__head">
          <h2 id="settings-zoom" className="app-settings-block__title">
            Zoom
          </h2>
          <p className="app-settings-block__sub">
            Adjust global UI scale. Use Ctrl+= / Ctrl+- in any view.
          </p>
        </header>
        <div className="app-settings-row">
          <div>
            <div className="app-settings-row__label">Current factor</div>
            <div className="app-settings-row__value">{zoomFactor.toFixed(2)}×</div>
          </div>
          <button
            type="button"
            className="app-settings-btn"
            onClick={handleResetZoom}
            disabled={zoomFactor === 1.0}
          >
            Reset to 1.00×
          </button>
        </div>
      </section>

      <section className="app-settings-block" aria-labelledby="settings-mascot">
        <header className="app-settings-block__head">
          <h2 id="settings-mascot" className="app-settings-block__title">
            Mascot
          </h2>
          <p className="app-settings-block__sub">
            Show Pixel, the ops-room cat, in the Home greeting row. Pose reflects running sessions,
            alerts, and local time. Off by default.
          </p>
        </header>
        <MascotToggle />
      </section>

      <section className="app-settings-block" aria-labelledby="settings-about">
        <header className="app-settings-block__head">
          <h2 id="settings-about" className="app-settings-block__title">
            About
          </h2>
          <p className="app-settings-block__sub">
            AgentDeck — Electron + React. Elastic License 2.0. See the About dialog for build info.
          </p>
        </header>
      </section>
    </ScreenShell>
  )
}

function MascotToggle(): React.JSX.Element {
  const enabled = useAppStore((s) => s.mascotEnabled)
  const setMascotEnabled = useAppStore((s) => s.setMascotEnabled)
  return (
    <div className="app-settings-row">
      <div>
        <div className="app-settings-row__label">Current state</div>
        <div className="app-settings-row__value">{enabled ? 'ENABLED' : 'DISABLED'}</div>
      </div>
      <button type="button" className="app-settings-btn" onClick={() => setMascotEnabled(!enabled)}>
        {enabled ? 'Turn off' : 'Turn on'}
      </button>
    </div>
  )
}
