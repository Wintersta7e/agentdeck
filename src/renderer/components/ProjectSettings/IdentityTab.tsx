import type { Project } from '../../../shared/types'

interface TabProps {
  draft: Project
  onChange: (updates: Partial<Project>) => void
}

const COLORS = ['#e55934', '#f5a623', '#4caf7d', '#5b9bd5', '#9b72cf', '#e05c5c', '#6e6b66']

const ICONS = [
  '\u2B21',
  '\u26A1',
  '\u{1F680}',
  '\u{1F4E6}',
  '\u{1F9EA}',
  '\u{1F3AF}',
  '\u2699\uFE0F',
  '\u{1F4BB}',
  '\u{1F527}',
  '\u{1F30D}',
]

export function IdentityTab({ draft, onChange }: TabProps): React.JSX.Element {
  const currentColor = draft.identity?.accentColor ?? '#f5a623'
  const currentIcon = draft.identity?.icon ?? '\u2B21'

  function setColor(color: string): void {
    onChange({
      identity: {
        icon: currentIcon,
        accentColor: color,
      },
    })
  }

  function setIcon(icon: string): void {
    onChange({
      identity: {
        icon,
        accentColor: currentColor,
      },
    })
  }

  return (
    <div className="settings-tab-panel">
      {/* Appearance */}
      <div className="settings-section">
        <div className="section-head">
          <div className="section-head-title">Appearance</div>
        </div>
        <div className="section-body">
          <div className="identity-picker">
            {/* Accent color */}
            <div>
              <div className="picker-label">Accent Color</div>
              <div className="color-swatches" role="radiogroup" aria-label="Accent color">
                {COLORS.map((color) => (
                  <div
                    key={color}
                    className={`swatch${currentColor === color ? ' selected' : ''}`}
                    style={{ background: color }}
                    onClick={() => setColor(color)}
                    role="radio"
                    tabIndex={0}
                    aria-label={color}
                    aria-checked={currentColor === color}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setColor(color)
                      }
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Icon */}
            <div>
              <div className="picker-label">Icon</div>
              <div className="icon-row" role="radiogroup" aria-label="Project icon">
                {ICONS.map((icon) => (
                  <div
                    key={icon}
                    className={`icon-opt${currentIcon === icon ? ' selected' : ''}`}
                    onClick={() => setIcon(icon)}
                    role="radio"
                    tabIndex={0}
                    aria-label={`Icon: ${icon}`}
                    aria-checked={currentIcon === icon}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setIcon(icon)
                      }
                    }}
                  >
                    {icon}
                  </div>
                ))}
              </div>
            </div>

            {/* Live Preview */}
            <div className="identity-preview">
              <div className="identity-preview-label">Preview</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Sidebar item preview */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: currentColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {currentIcon}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text0)', fontWeight: 600 }}>
                    {draft.name || 'Untitled'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text2)' }}>
                    {draft.path || '/path/to/project'}
                  </div>
                </div>
              </div>
              {/* Tab preview */}
              <div
                style={{
                  marginTop: 10,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  background: 'var(--bg2)',
                  borderRadius: 'var(--r)',
                  borderBottom: `2px solid ${currentColor}`,
                  fontSize: 11,
                  color: 'var(--text0)',
                }}
              >
                <span style={{ fontSize: 12 }}>{currentIcon}</span>
                {draft.name || 'Untitled'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
