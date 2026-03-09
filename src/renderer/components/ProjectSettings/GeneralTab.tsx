import type { Project, StackBadge } from '../../../shared/types'
import { Toggle } from '../shared/Toggle'
import { PathInput } from '../shared/PathInput'

interface TabProps {
  draft: Project
  onChange: (updates: Partial<Project>) => void
}

const STACK_BADGES: StackBadge[] = [
  'Java',
  'JS',
  'TS',
  'Python',
  'Rust',
  'Go',
  '.NET',
  'Agent',
  'Other',
]

export function GeneralTab({ draft, onChange }: TabProps): React.JSX.Element {
  return (
    <div className="settings-tab-panel">
      {/* Project Info */}
      <div className="settings-section">
        <div className="section-head">
          <div className="section-head-title">Project Info</div>
        </div>
        <div className="section-body">
          <div className="form-row">
            <div className="form-label-col">
              <div className="form-label">Display name</div>
            </div>
            <div className="form-control-col">
              <input
                type="text"
                className="settings-input"
                value={draft.name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="My Project"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-label-col">
              <div className="form-label">Project path</div>
              <div className="form-sublabel">WSL path to the project root</div>
            </div>
            <div className="form-control-col">
              <PathInput
                value={draft.path}
                onChange={(value) => onChange({ path: value })}
                placeholder="~/projects/my-project"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-label-col">
              <div className="form-label">WSL distro</div>
              <div className="form-sublabel">Leave empty for default</div>
            </div>
            <div className="form-control-col">
              <input
                type="text"
                className="settings-input"
                value={draft.wslDistro ?? ''}
                onChange={(e) => onChange({ wslDistro: e.target.value })}
                placeholder="Ubuntu-24.04"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-label-col">
              <div className="form-label">Notes</div>
            </div>
            <div className="form-control-col">
              <input
                type="text"
                className="settings-input"
                value={draft.notes ?? ''}
                onChange={(e) => onChange({ notes: e.target.value })}
                placeholder="Short description"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Behaviour */}
      <div className="settings-section">
        <div className="section-head">
          <div className="section-head-title">Behaviour</div>
        </div>
        <div className="section-body">
          <div className="form-row">
            <div className="form-label-col">
              <div className="form-label">Pin to sidebar</div>
              <div className="form-sublabel">Always visible in the sidebar</div>
            </div>
            <div className="form-control-col">
              <Toggle value={draft.pinned ?? false} onChange={(val) => onChange({ pinned: val })} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-label-col">
              <div className="form-label">Auto-open on launch</div>
              <div className="form-sublabel">Start a session when AgentDeck opens</div>
            </div>
            <div className="form-control-col">
              <Toggle
                value={draft.autoOpen ?? false}
                onChange={(val) => onChange({ autoOpen: val })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-label-col">
              <div className="form-label">Stack badge</div>
              <div className="form-sublabel">Shown beside project name</div>
            </div>
            <div className="form-control-col">
              <select
                className="select-input"
                value={draft.badge ?? 'Other'}
                onChange={(e) => onChange({ badge: e.target.value as StackBadge })}
              >
                {STACK_BADGES.map((badge) => (
                  <option key={badge} value={badge}>
                    {badge}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
