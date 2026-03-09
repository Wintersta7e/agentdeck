import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import './InputBar.css'

interface InputBarProps {
  sessionId: string
  focused: boolean
  projectId?: string
}

export const InputBar = memo(function InputBar({
  sessionId,
  focused,
  projectId,
}: InputBarProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Granular selector — only the attached template IDs for this project
  const attachedTemplateIds = useAppStore(
    (s) =>
      (projectId ? s.projects.find((p) => p.id === projectId)?.attachedTemplates : undefined) ?? [],
  )
  const templates = useAppStore((s) => s.templates)

  const attachedTemplates = useMemo(
    () =>
      attachedTemplateIds
        .map((tid) => templates.find((t) => t.id === tid))
        .filter((t): t is NonNullable<typeof t> => t != null),
    [attachedTemplateIds, templates],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && value.trim() !== '') {
        void window.agentDeck.pty.write(sessionId, value + '\n')
        setValue('')
      }
    },
    [sessionId, value],
  )

  const handleChipClick = useCallback(
    (templateId: string) => {
      const template = templates.find((t) => t.id === templateId)
      if (template?.content) {
        void window.agentDeck.pty.write(sessionId, template.content + '\n')
      }
    },
    [sessionId, templates],
  )

  return (
    <div className="input-bar">
      <div className="input-row">
        <span className={`input-prompt-sym ${focused ? 'focused' : 'dim'}`}>&gt;</span>
        <input
          ref={inputRef}
          className="input-field"
          type="text"
          placeholder="Send a message..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {attachedTemplates.length > 0 && (
        <div className="input-chips">
          {attachedTemplates.map((t) => (
            <span key={t.id} className="input-chip" onClick={() => handleChipClick(t.id)}>
              {t.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})
