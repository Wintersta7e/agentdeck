import type { Project } from '../../../shared/types'
import { useAppStore } from '../../store/appStore'

interface TabProps {
  draft: Project
  onChange: (updates: Partial<Project>) => void
}

export function TemplatesTab({ draft, onChange }: TabProps): React.JSX.Element {
  const templates = useAppStore((s) => s.templates)
  const attached = draft.attachedTemplates ?? []

  function removeTemplate(templateId: string): void {
    onChange({
      attachedTemplates: attached.filter((id) => id !== templateId),
    })
  }

  function toggleTemplate(templateId: string): void {
    const exists = attached.includes(templateId)
    if (exists) {
      onChange({ attachedTemplates: attached.filter((id) => id !== templateId) })
    } else {
      onChange({ attachedTemplates: [...attached, templateId] })
    }
  }

  const attachedTemplates = templates.filter((t) => attached.includes(t.id))

  return (
    <div className="settings-tab-panel">
      {/* Attached Templates */}
      <div className="settings-section">
        <div className="section-head">
          <div className="section-head-title">Attached Templates</div>
        </div>
        <div className="section-body">
          {attachedTemplates.length > 0 ? (
            <div className="template-chips-grid">
              {attachedTemplates.map((tpl) => (
                <div key={tpl.id} className="template-chip-item active">
                  <span>{tpl.name}</span>
                  <button
                    type="button"
                    className="chip-remove"
                    onClick={() => removeTemplate(tpl.id)}
                    aria-label={`Remove ${tpl.name}`}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>
              No templates attached. Add templates from the list below.
            </div>
          )}
        </div>
      </div>

      {/* All Templates */}
      <div className="settings-section">
        <div className="section-head">
          <div className="section-head-title">All Templates</div>
        </div>
        <div className="section-body">
          {templates.length > 0 ? (
            templates.map((tpl) => {
              const isAttached = attached.includes(tpl.id)
              return (
                <div
                  key={tpl.id}
                  className="template-list-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleTemplate(tpl.id)}
                >
                  <div style={{ flex: 1 }}>
                    <div className="template-list-name">
                      {tpl.name}
                      {isAttached && (
                        <span style={{ color: 'var(--amber)', marginLeft: 6, fontSize: 9 }}>
                          attached
                        </span>
                      )}
                    </div>
                    {tpl.description && <div className="template-list-desc">{tpl.description}</div>}
                  </div>
                </div>
              )
            })
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>
              No templates available. Create templates in the Template Editor.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
