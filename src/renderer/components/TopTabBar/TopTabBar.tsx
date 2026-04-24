import { useCallback, useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import type { ViewType } from '../../../shared/types'
import './TopTabBar.css'

type TabId =
  | 'home'
  | 'sessions'
  | 'projects'
  | 'agents'
  | 'workflows'
  | 'history'
  | 'alerts'
  | 'settings'

interface TabDef {
  id: TabId
  label: string
  view: ViewType
  shortcut?: string
}

/**
 * Top-level tab bar (Option B redesign nav).
 *
 * Sits directly below the Titlebar and replaces the sidebar as primary
 * navigation. Each tab corresponds to a top-level screen. Sub-views
 * (session detail, project detail, diff review, wizard, etc.) render
 * under their owning tab via tabParams.
 */
const TABS: readonly TabDef[] = [
  { id: 'home', label: 'Home', view: 'home', shortcut: 'Alt+1' },
  { id: 'sessions', label: 'Sessions', view: 'sessions', shortcut: 'Alt+2' },
  { id: 'projects', label: 'Projects', view: 'projects', shortcut: 'Alt+3' },
  { id: 'agents', label: 'Agents', view: 'agents', shortcut: 'Alt+4' },
  { id: 'workflows', label: 'Workflows', view: 'workflows', shortcut: 'Alt+5' },
  { id: 'history', label: 'History', view: 'history', shortcut: 'Alt+6' },
  { id: 'alerts', label: 'Alerts', view: 'alerts', shortcut: 'Alt+7' },
  { id: 'settings', label: 'Settings', view: 'app-settings', shortcut: 'Alt+8' },
] as const

/** Map an arbitrary ViewType to its owning top-level tab. */
function viewToTab(view: ViewType): TabId {
  switch (view) {
    case 'home':
      return 'home'
    case 'session':
    case 'sessions':
    case 'new-session':
    case 'diff':
      return 'sessions'
    case 'projects':
    case 'project-detail':
    case 'wizard':
    case 'settings':
      return 'projects'
    case 'agents':
      return 'agents'
    case 'workflow':
    case 'workflows':
      return 'workflows'
    case 'history':
      return 'history'
    case 'alerts':
      return 'alerts'
    case 'app-settings':
    case 'template-editor':
      return 'settings'
    default:
      return 'home'
  }
}

export function TopTabBar(): React.JSX.Element {
  const currentView = useAppStore((s) => s.currentView)
  const setTab = useAppStore((s) => s.setTab)
  const alertCount = useAppStore((s) => s.notifications.filter((n) => n.kind === 'basic').length)

  const activeTab = useMemo<TabId>(() => viewToTab(currentView), [currentView])

  const handleClick = useCallback(
    (tab: TabDef): void => {
      setTab(tab.view)
    },
    [setTab],
  )

  return (
    <nav className="top-tab-bar" aria-label="Primary navigation">
      <ul className="top-tab-bar__list" role="tablist">
        {TABS.map((tab) => {
          const active = activeTab === tab.id
          const badge = tab.id === 'alerts' && alertCount > 0 ? alertCount : null
          return (
            <li key={tab.id} className="top-tab-bar__item">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-current={active ? 'page' : undefined}
                className={`top-tab-bar__tab${active ? ' is-active' : ''}`}
                onClick={() => handleClick(tab)}
                title={tab.shortcut ? `${tab.label} (${tab.shortcut})` : tab.label}
              >
                <span className="top-tab-bar__label">{tab.label}</span>
                {badge !== null && (
                  <span className="top-tab-bar__badge" aria-label={`${badge} alerts`}>
                    {badge}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="top-tab-bar__trailing" aria-hidden="true">
        <span className="top-tab-bar__system">WSL</span>
      </div>
    </nav>
  )
}
