import { memo } from 'react'
import { FileText, GitBranch, Folder, Settings, MessageSquare } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { DiffTab } from './DiffTab'
import { FilesTab } from './FilesTab'
import { ConfigTab } from './ConfigTab'
import { PromptsInspector } from './PromptsInspector'
import { EnvTab } from './EnvTab'
import type { RightPanelTab } from '../../../shared/types'
import './RightPanel.css'

const TAB_ICONS: Record<RightPanelTab, React.JSX.Element> = {
  files: <Folder size={12} />,
  diff: <GitBranch size={12} />,
  prompts: <MessageSquare size={12} />,
  env: <FileText size={12} />,
  config: <Settings size={12} />,
}

const TABS: { key: RightPanelTab; label: string }[] = [
  { key: 'files', label: 'Files' },
  { key: 'diff', label: 'Diff' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'env', label: 'Env' },
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
        {rightPanelTab === 'files' && <FilesTab />}
        {rightPanelTab === 'diff' && <DiffTab />}
        {rightPanelTab === 'prompts' && <PromptsInspector />}
        {rightPanelTab === 'env' && <EnvTab />}
        {rightPanelTab === 'config' && <ConfigTab />}
      </div>
    </div>
  )
})
