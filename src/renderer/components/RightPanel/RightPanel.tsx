import { memo } from 'react'
import { Activity, Brain, FileText, GitBranch, Folder, DollarSign, Settings } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { ActivityTab } from './ActivityTab'
import { ContextTab } from './ContextTab'
import { MemoryTab } from './MemoryTab'
import { DiffTab } from './DiffTab'
import { FilesTab } from './FilesTab'
import { CostTab } from './CostTab'
import { ConfigTab } from './ConfigTab'
import type { RightPanelTab } from '../../../shared/types'
import './RightPanel.css'

const TAB_ICONS: Record<RightPanelTab, React.JSX.Element> = {
  context: <FileText size={12} />,
  activity: <Activity size={12} />,
  memory: <Brain size={12} />,
  diff: <GitBranch size={12} />,
  files: <Folder size={12} />,
  cost: <DollarSign size={12} />,
  config: <Settings size={12} />,
}

const TABS: { key: RightPanelTab; label: string }[] = [
  { key: 'context', label: 'Context' },
  { key: 'activity', label: 'Activity' },
  { key: 'memory', label: 'Memory' },
  { key: 'diff', label: 'Diff' },
  { key: 'files', label: 'Files' },
  { key: 'cost', label: 'Cost' },
  { key: 'config', label: 'Config' },
]

export const RightPanel = memo(function RightPanel(): React.JSX.Element {
  const rightPanelTab = useAppStore((s) => s.rightPanelTab)
  const setRightPanelTab = useAppStore((s) => s.setRightPanelTab)

  return (
    <div className="right-panel">
      <div className="panel-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            id={`panel-tab-${tab.key}`}
            role="tab"
            aria-selected={rightPanelTab === tab.key}
            className={`panel-tab${rightPanelTab === tab.key ? ' active' : ''}`}
            onClick={() => setRightPanelTab(tab.key)}
            title={tab.label}
          >
            {TAB_ICONS[tab.key]}
            <span className="panel-tab__label">{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="panel-body" role="tabpanel" aria-labelledby={`panel-tab-${rightPanelTab}`}>
        {rightPanelTab === 'context' && <ContextTab />}
        {rightPanelTab === 'activity' && <ActivityTab />}
        {rightPanelTab === 'memory' && <MemoryTab />}
        {rightPanelTab === 'diff' && <DiffTab />}
        {rightPanelTab === 'files' && <FilesTab />}
        {rightPanelTab === 'cost' && <CostTab />}
        {rightPanelTab === 'config' && <ConfigTab />}
      </div>
    </div>
  )
})
