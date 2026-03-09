import type { Project, StartupCommand, EnvVar } from '../../../shared/types'
import { SortableList } from '../shared/SortableList'
import { EnvVarRow } from '../shared/EnvVarRow'

interface TabProps {
  draft: Project
  onChange: (updates: Partial<Project>) => void
}

export function StartupTab({ draft, onChange }: TabProps): React.JSX.Element {
  const commands = draft.startupCommands ?? []
  const envVars = draft.envVars ?? []

  function addCommand(): void {
    const cmd: StartupCommand = { id: crypto.randomUUID(), value: '' }
    onChange({ startupCommands: [...commands, cmd] })
  }

  function updateCommand(id: string, value: string): void {
    onChange({
      startupCommands: commands.map((c) => (c.id === id ? { ...c, value } : c)),
    })
  }

  function removeCommand(id: string): void {
    onChange({
      startupCommands: commands.filter((c) => c.id !== id),
    })
  }

  function reorderCommands(items: StartupCommand[]): void {
    onChange({ startupCommands: items })
  }

  function addEnvVar(): void {
    const envVar: EnvVar = { id: crypto.randomUUID(), key: '', value: '', secret: false }
    onChange({ envVars: [...envVars, envVar] })
  }

  function updateEnvVar(updated: EnvVar): void {
    onChange({
      envVars: envVars.map((v) => (v.id === updated.id ? updated : v)),
    })
  }

  function removeEnvVar(id: string): void {
    onChange({
      envVars: envVars.filter((v) => v.id !== id),
    })
  }

  function reorderEnvVars(items: EnvVar[]): void {
    onChange({ envVars: items })
  }

  return (
    <div className="settings-tab-panel">
      {/* Startup Commands */}
      <div className="settings-section">
        <div className="section-head">
          <div className="section-head-title">Startup Commands</div>
        </div>
        <div className="section-body">
          <SortableList
            items={commands}
            onReorder={reorderCommands}
            onRemove={removeCommand}
            renderItem={(item) => (
              <input
                type="text"
                className="settings-cmd-input"
                value={item.value}
                onChange={(e) => updateCommand(item.id, e.target.value)}
                placeholder="Enter command..."
              />
            )}
          />
          <button type="button" className="settings-add-btn" onClick={addCommand}>
            + Add command
          </button>
        </div>
      </div>

      {/* Environment Variables */}
      <div className="settings-section">
        <div className="section-head">
          <div className="section-head-title">Environment Variables</div>
        </div>
        <div className="section-body">
          <SortableList
            items={envVars}
            onReorder={reorderEnvVars}
            onRemove={removeEnvVar}
            renderItem={(item) => <EnvVarRow envVar={item} onChange={updateEnvVar} />}
          />
          <button type="button" className="settings-add-btn" onClick={addEnvVar}>
            + Add variable
          </button>
        </div>
      </div>
    </div>
  )
}
