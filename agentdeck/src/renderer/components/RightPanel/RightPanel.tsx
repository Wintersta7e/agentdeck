import { useAppStore } from '../../store/appStore'
import { ActivityTab } from './ActivityTab'
import { ContextTab } from './ContextTab'
import type { RightPanelTab } from '../../../shared/types'
import './RightPanel.css'

const TABS: { key: RightPanelTab; label: string }[] = [
  { key: 'context', label: 'Context' },
  { key: 'activity', label: 'Activity' },
  { key: 'memory', label: 'Memory' },
]

export function RightPanel(): React.JSX.Element {
  const rightPanelTab = useAppStore((s) => s.rightPanelTab)
  const setRightPanelTab = useAppStore((s) => s.setRightPanelTab)

  return (
    <div className="right-panel">
      <div className="panel-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`panel-tab${rightPanelTab === tab.key ? ' active' : ''}`}
            onClick={() => setRightPanelTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {rightPanelTab === 'context' && <ContextTab />}
        {rightPanelTab === 'activity' && <ActivityTab />}
        {rightPanelTab === 'memory' && (
          <div className="panel-placeholder">Memory viewer — coming soon</div>
        )}
      </div>
    </div>
  )
}
