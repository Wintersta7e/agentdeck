import { useState, useEffect, useCallback } from 'react'
import type {
  Project,
  StartupCommand,
  EnvVar,
  DetectedStack,
  AgentType,
} from '../../../shared/types'
import { useProjects } from '../../hooks/useProjects'
import { useAppStore } from '../../store/appStore'
import { PathInput } from '../shared/PathInput'
import { Toggle } from '../shared/Toggle'
import { AgentSelector } from '../shared/AgentSelector'
import { StackBadgeSelector } from '../shared/StackBadgeSelector'
import { StepPanel } from '../shared/StepPanel'
import { SortableList } from '../shared/SortableList'
import { EnvVarRow } from '../shared/EnvVarRow'
import './NewProjectWizard.css'

const STEPS = [
  { name: 'Choose folder', desc: 'Select or paste the project path' },
  { name: 'Auto-detect', desc: 'Review what was found in the folder' },
  { name: 'Startup commands', desc: 'Commands to run when opening the project' },
  { name: 'Agent & templates', desc: 'Pick an agent and attach prompt templates' },
  { name: 'Confirm', desc: 'Review and create the project' },
]

interface NewProjectWizardProps {
  onCreateProject: (project: Project) => void
}

export function NewProjectWizard({ onCreateProject }: NewProjectWizardProps): React.JSX.Element {
  const { addProject, updateProject, templates } = useProjects()
  const closeWizard = useAppStore((s) => s.closeWizard)

  const [currentStep, setCurrentStep] = useState(0)
  const [wizardData, setWizardData] = useState<Partial<Project>>({
    agent: 'claude-code',
    pinned: true,
    startupCommands: [],
    envVars: [],
    attachedTemplates: [],
  })
  const [detectedStack, setDetectedStack] = useState<DetectedStack | null>(null)
  const [distro, setDistro] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Prefill default WSL distro on mount
  useEffect(() => {
    void window.agentDeck.projects
      .getDefaultDistro()
      .then((d) => {
        setDistro(d)
        setWizardData((prev) => ({ ...prev, wslDistro: d }))
      })
      .catch(() => {
        // Use default, notification not needed for this
      })
  }, [])

  // Run stack detection when path is set (triggered on blur)
  const runDetection = useCallback(
    async (path: string): Promise<void> => {
      if (!path.trim()) return

      // Auto-fill name from path
      const folderName = path.split('/').pop() ?? ''
      setWizardData((prev) => ({
        ...prev,
        name: prev.name || folderName,
      }))

      try {
        const result = await window.agentDeck.projects.detectStack(path, distro || undefined)
        setDetectedStack(result)

        if (result) {
          setWizardData((prev) => ({
            ...prev,
            badge: result.badge,
            agent: result.suggestedAgent,
            startupCommands: result.suggestedCommands.map((cmd) => ({
              id: crypto.randomUUID(),
              value: cmd,
            })),
          }))
        }
      } catch {
        setDetectedStack(null)
      }
    },
    [distro],
  )

  function updateField<K extends keyof Project>(key: K, value: Project[K]): void {
    setWizardData((prev) => ({ ...prev, [key]: value }))
  }

  // Startup command helpers
  function addCommand(): void {
    const cmd: StartupCommand = { id: crypto.randomUUID(), value: '' }
    setWizardData((prev) => ({
      ...prev,
      startupCommands: [...(prev.startupCommands ?? []), cmd],
    }))
  }

  function updateCommand(id: string, value: string): void {
    setWizardData((prev) => ({
      ...prev,
      startupCommands: (prev.startupCommands ?? []).map((c) => (c.id === id ? { ...c, value } : c)),
    }))
  }

  function removeCommand(id: string): void {
    setWizardData((prev) => ({
      ...prev,
      startupCommands: (prev.startupCommands ?? []).filter((c) => c.id !== id),
    }))
  }

  function reorderCommands(items: StartupCommand[]): void {
    setWizardData((prev) => ({ ...prev, startupCommands: items }))
  }

  // Env var helpers
  function addEnvVar(): void {
    const envVar: EnvVar = { id: crypto.randomUUID(), key: '', value: '', secret: false }
    setWizardData((prev) => ({
      ...prev,
      envVars: [...(prev.envVars ?? []), envVar],
    }))
  }

  function updateEnvVar(updated: EnvVar): void {
    setWizardData((prev) => ({
      ...prev,
      envVars: (prev.envVars ?? []).map((v) => (v.id === updated.id ? updated : v)),
    }))
  }

  function removeEnvVar(id: string): void {
    setWizardData((prev) => ({
      ...prev,
      envVars: (prev.envVars ?? []).filter((v) => v.id !== id),
    }))
  }

  function reorderEnvVars(items: EnvVar[]): void {
    setWizardData((prev) => ({ ...prev, envVars: items }))
  }

  // Template toggle
  function toggleTemplate(templateId: string): void {
    setWizardData((prev) => {
      const attached = prev.attachedTemplates ?? []
      const exists = attached.includes(templateId)
      return {
        ...prev,
        attachedTemplates: exists
          ? attached.filter((id) => id !== templateId)
          : [...attached, templateId],
      }
    })
  }

  // Navigation
  function handleStepGoTo(step: number): void {
    if (step <= currentStep) {
      setCurrentStep(step)
    }
  }

  function isNextEnabled(): boolean {
    switch (currentStep) {
      case 0:
        return Boolean(wizardData.path?.trim())
      case 3:
        return Boolean(wizardData.agent)
      default:
        return true
    }
  }

  function handleNext(): void {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1)
    }
  }

  function handleBack(): void {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1)
    }
  }

  async function handleCreate(): Promise<void> {
    if (isCreating) return
    setIsCreating(true)
    try {
      const saved = await addProject(wizardData)
      await updateProject({ ...saved, lastOpened: Date.now() })
      onCreateProject(saved)
      closeWizard()
    } catch {
      // Notification dispatched by useProjects
    } finally {
      setIsCreating(false)
    }
  }

  // Find template names by ID for the summary view
  function getTemplateName(id: string): string {
    return templates.find((t) => t.id === id)?.name ?? id
  }

  return (
    <div className="wizard-shell">
      {/* Left step panel */}
      <div className="wizard-steps-panel">
        <StepPanel steps={STEPS} currentStep={currentStep} onGoTo={handleStepGoTo} />
      </div>

      {/* Main area */}
      <div className="wizard-main">
        <div className="wizard-content">
          {/* ── Step 0: Choose folder ── */}
          <div className={`wizard-step-panel ${currentStep === 0 ? 'active' : ''}`}>
            <div className="step-title">Choose a folder</div>
            <div className="step-subtitle">
              Point AgentDeck at your project root. It will scan for known files to pre-fill the
              next steps.
            </div>

            <div className="wizard-field">
              <div className="wizard-field-label">
                Project path <span className="wizard-field-required">*</span>
              </div>
              <div onBlur={() => void runDetection(wizardData.path ?? '')}>
                <PathInput
                  value={wizardData.path ?? ''}
                  onChange={(value) => updateField('path', value)}
                  placeholder="~/projects/my-project"
                />
              </div>
            </div>

            <div className="wizard-field">
              <div className="wizard-field-label">
                Display name <span className="wizard-field-hint">Auto-filled from folder name</span>
              </div>
              <input
                type="text"
                className="wizard-input"
                value={wizardData.name ?? ''}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="My Project"
              />
            </div>

            <div className="wizard-field">
              <div className="wizard-field-label">
                WSL distribution <span className="wizard-field-hint">Optional</span>
              </div>
              <input
                type="text"
                className="wizard-input"
                value={distro}
                onChange={(e) => {
                  setDistro(e.target.value)
                  updateField('wslDistro', e.target.value)
                }}
                placeholder="Ubuntu-24.04"
              />
            </div>
          </div>

          {/* ── Step 1: Auto-detect ── */}
          <div className={`wizard-step-panel ${currentStep === 1 ? 'active' : ''}`}>
            <div className="step-title">What we found</div>
            <div className="step-subtitle">
              AgentDeck scanned{' '}
              <span style={{ color: 'var(--text0)' }}>{wizardData.path ?? ''}</span> and detected
              the following. You can override anything.
            </div>

            {detectedStack ? (
              <div className="detection-banner">
                <div className="detection-icon">{'\u2713'}</div>
                <div className="detection-body">
                  <div className="detection-title">Detected stack</div>
                  <div className="detection-items">
                    {detectedStack.items.map((item, i) => (
                      <span key={i} className="detection-chip">
                        {item.label}
                        {item.detail ? ` ${item.detail}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="detection-empty">
                No known frameworks detected. You can set the stack badge manually below.
              </div>
            )}

            <div className="wizard-field">
              <div className="wizard-field-label">Stack badge</div>
              <StackBadgeSelector
                value={wizardData.badge ?? detectedStack?.badge ?? 'Other'}
                onChange={(badge) => updateField('badge', badge)}
              />
            </div>

            <div className="wizard-field">
              <div className="wizard-field-label">
                Project notes <span className="wizard-field-hint">Shown in context panel</span>
              </div>
              <input
                type="text"
                className="wizard-input"
                value={wizardData.notes ?? ''}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Short description (optional)"
              />
            </div>
          </div>

          {/* ── Step 2: Startup commands ── */}
          <div className={`wizard-step-panel ${currentStep === 2 ? 'active' : ''}`}>
            <div className="step-title">Startup commands</div>
            <div className="step-subtitle">
              These run in order every time you open this project. The last command is typically
              your agent invocation.
            </div>

            <SortableList
              items={wizardData.startupCommands ?? []}
              onReorder={reorderCommands}
              onRemove={removeCommand}
              renderItem={(item) => (
                <input
                  type="text"
                  className="cmd-input"
                  value={item.value}
                  onChange={(e) => updateCommand(item.id, e.target.value)}
                  placeholder="Enter command..."
                />
              )}
            />
            <button type="button" className="wizard-add-btn" onClick={addCommand}>
              + Add command
            </button>

            <div className="wizard-section-sep">
              <div className="wizard-field-label" style={{ marginBottom: 8 }}>
                Environment variables <span className="wizard-field-hint">Optional</span>
              </div>
              <SortableList
                items={wizardData.envVars ?? []}
                onReorder={reorderEnvVars}
                onRemove={removeEnvVar}
                renderItem={(item) => <EnvVarRow envVar={item} onChange={updateEnvVar} />}
              />
              <button type="button" className="wizard-add-btn" onClick={addEnvVar}>
                + Add variable
              </button>
            </div>
          </div>

          {/* ── Step 3: Agent & templates ── */}
          <div className={`wizard-step-panel ${currentStep === 3 ? 'active' : ''}`}>
            <div className="step-title">Agent &amp; templates</div>
            <div className="step-subtitle">
              Choose which agent to use and attach prompt templates you&apos;ll reach for often in
              this project.
            </div>

            <div className="wizard-field">
              <div className="wizard-field-label">
                Agent <span className="wizard-field-required">*</span>
              </div>
              <AgentSelector
                value={(wizardData.agent as AgentType) ?? 'claude-code'}
                onChange={(agent) => updateField('agent', agent)}
              />
            </div>

            <div className="wizard-field">
              <div className="wizard-field-label">
                Attach templates{' '}
                <span className="wizard-field-hint">Appear as quick chips in the input bar</span>
              </div>
              {templates.length > 0 ? (
                <div className="template-select-list">
                  {templates.map((tpl) => {
                    const isSelected = (wizardData.attachedTemplates ?? []).includes(tpl.id)
                    return (
                      <div
                        key={tpl.id}
                        className={`template-opt ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleTemplate(tpl.id)}
                      >
                        <div className="template-checkbox">{isSelected ? '\u2713' : ''}</div>
                        <div className="template-opt-body">
                          <div className="template-opt-name">{tpl.name}</div>
                          {tpl.description && (
                            <div className="template-opt-desc">{tpl.description}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="detection-empty">
                  No templates yet. You can create templates later in settings.
                </div>
              )}
            </div>
          </div>

          {/* ── Step 4: Confirm ── */}
          <div className={`wizard-step-panel ${currentStep === 4 ? 'active' : ''}`}>
            <div className="step-title">Ready to create</div>
            <div className="step-subtitle">
              Review everything below. You can change any of this later in Project Settings.
            </div>

            <div className="summary-card">
              <div className="summary-header">
                <div className="summary-icon">{wizardData.identity?.icon ?? '\u2B21'}</div>
                <div>
                  <div className="summary-project-name">{wizardData.name || 'Untitled'}</div>
                  <div className="summary-project-path">
                    {wizardData.path ?? ''} {distro ? `\u00B7 WSL2 \u00B7 ${distro}` : ''}
                  </div>
                </div>
              </div>
              <div className="summary-rows">
                <div className="summary-row">
                  <div className="summary-label">Stack</div>
                  <div className="summary-value">
                    <div className="summary-chips">
                      <span className="summary-chip">{wizardData.badge ?? 'Other'}</span>
                      {detectedStack?.items.map((item, i) => (
                        <span key={i} className="summary-chip">
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="summary-row">
                  <div className="summary-label">Agent</div>
                  <div className="summary-value" style={{ color: 'var(--amber)' }}>
                    {wizardData.agent ?? 'claude-code'}
                  </div>
                </div>
                {(wizardData.startupCommands ?? []).length > 0 && (
                  <div className="summary-row">
                    <div className="summary-label">Startup</div>
                    <div className="summary-value">
                      <div style={{ color: 'var(--text2)', lineHeight: 1.8 }}>
                        {(wizardData.startupCommands ?? []).map((cmd, i) => (
                          <span key={cmd.id}>
                            {cmd.value}
                            {i < (wizardData.startupCommands ?? []).length - 1 && <br />}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {(wizardData.attachedTemplates ?? []).length > 0 && (
                  <div className="summary-row">
                    <div className="summary-label">Templates</div>
                    <div className="summary-value">
                      <div className="summary-chips">
                        {(wizardData.attachedTemplates ?? []).map((id) => (
                          <span key={id} className="summary-chip" style={{ color: 'var(--amber)' }}>
                            {getTemplateName(id)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="summary-row">
                  <div className="summary-label">Pin</div>
                  <div
                    className="summary-value"
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <Toggle
                      value={wizardData.pinned ?? true}
                      onChange={(val) => updateField('pinned', val)}
                      label="Pin to sidebar"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="wizard-info-banner">
              {'\u2B21'} AgentDeck will immediately open a session and run the startup commands.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="wizard-footer">
          <div className="wizard-step-counter">
            Step <span>{currentStep + 1}</span> of {STEPS.length}
          </div>
          <div className="wizard-footer-spacer" />
          <button
            type="button"
            className="wizard-btn"
            disabled={currentStep === 0}
            onClick={handleBack}
          >
            {'\u2190'} Back
          </button>
          {currentStep === STEPS.length - 1 ? (
            <button
              type="button"
              className="wizard-btn primary"
              disabled={!isNextEnabled() || isCreating}
              onClick={() => void handleCreate()}
            >
              {'\u2713'} Create Project
            </button>
          ) : (
            <button
              type="button"
              className="wizard-btn primary"
              disabled={!isNextEnabled()}
              onClick={handleNext}
            >
              Next {'\u2192'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
