import { useCallback, useMemo, useState } from 'react'
import { Edit, Copy, Trash2, Plus } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useAgentRegistry } from '../../hooks/useAgentRegistry'
import { getProjectAgents } from '../../../shared/agent-helpers'
import type { AgentDescriptorWire } from '../../../shared/custom-agents'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { CustomAgentModal } from './CustomAgentModal'
import './CustomAgentsSection.css'

type ModalState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; agent: AgentDescriptorWire }
  | { kind: 'clone'; agent: AgentDescriptorWire }

/**
 * Count how many project defaults reference a given agent id.
 *
 * Project defaults live in the store, so they are counted exactly. Workflow
 * node references are NOT counted: `WorkflowMeta` in the store carries only
 * metadata (no node list), so checking nodes would require loading every
 * workflow file. The confirm copy notes this limitation.
 */
function countProjectRefs(
  projects: ReturnType<typeof useAppStore.getState>['projects'],
  agentId: string,
): number {
  return projects.filter((p) => getProjectAgents(p).some((a) => a.agent === agentId)).length
}

export function CustomAgentsSection(): React.JSX.Element {
  const registry = useAgentRegistry()
  const projects = useAppStore((s) => s.projects)
  const addNotification = useAppStore((s) => s.addNotification)

  const [modal, setModal] = useState<ModalState>({ kind: 'closed' })
  const [pendingDelete, setPendingDelete] = useState<AgentDescriptorWire | null>(null)

  const customAgents = useMemo(() => registry.filter((a) => a.source === 'user'), [registry])

  const deleteRefCount = useMemo(
    () => (pendingDelete ? countProjectRefs(projects, pendingDelete.id) : 0),
    [pendingDelete, projects],
  )

  const handleDeleteConfirm = useCallback(() => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    // Close the edit modal too, if the delete came from it.
    setModal({ kind: 'closed' })
    window.agentDeck.agents
      .deleteCustom(id)
      .then((ok) => {
        if (!ok) addNotification('error', `Could not remove agent "${id}"`)
      })
      .catch((err: unknown) => {
        addNotification('error', `Failed to remove agent "${id}": ${String(err)}`)
      })
  }, [pendingDelete, addNotification])

  return (
    <section className="cas" aria-labelledby="cas-heading">
      <div className="cas__header">
        <h2 id="cas-heading" className="cas__title">
          Custom Agents
        </h2>
        <button type="button" className="cas__add" onClick={() => setModal({ kind: 'add' })}>
          <Plus size={14} aria-hidden="true" />
          Add agent
        </button>
      </div>

      {customAgents.length === 0 ? (
        <p className="cas__empty">
          No custom agents yet. Add your own CLI (a local model wrapper, a personal script) to
          launch it like any built-in.
        </p>
      ) : (
        <ul className="cas__list">
          {customAgents.map((agent) => (
            <li className="cas__row" key={agent.id}>
              <span
                className="cas__icon"
                aria-hidden="true"
                style={{ color: `var(${agent.colorVar})` }}
              >
                {agent.icon}
              </span>
              <div className="cas__info">
                <span className="cas__name">{agent.name}</span>
                {agent.description && <span className="cas__short">{agent.description}</span>}
              </div>
              <code className="cas__binary">{agent.binary}</code>
              <div className="cas__actions">
                <button
                  type="button"
                  className="cas__icon-btn"
                  aria-label={`Edit ${agent.name}`}
                  onClick={() => setModal({ kind: 'edit', agent })}
                >
                  <Edit size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="cas__icon-btn"
                  aria-label={`Clone ${agent.name}`}
                  onClick={() => setModal({ kind: 'clone', agent })}
                >
                  <Copy size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="cas__icon-btn cas__icon-btn--danger"
                  aria-label={`Delete ${agent.name}`}
                  onClick={() => setPendingDelete(agent)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal.kind !== 'closed' && (
        <CustomAgentModal
          mode={modal.kind}
          initial={modal.kind === 'add' ? null : cloneInitial(modal.kind, modal.agent)}
          onClose={() => setModal({ kind: 'closed' })}
          onRequestRemove={modal.kind === 'edit' ? () => setPendingDelete(modal.agent) : undefined}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          title={`Remove ${pendingDelete.name}?`}
          message={buildDeleteMessage(deleteRefCount)}
          confirmLabel="Remove"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  )
}

/**
 * For clone, blank the id (and tag the name) so the modal derives a fresh,
 * unique id; for edit, pass the descriptor through unchanged.
 */
function cloneInitial(kind: 'edit' | 'clone', agent: AgentDescriptorWire): AgentDescriptorWire {
  if (kind === 'edit') return agent
  return { ...agent, id: '', name: `${agent.name} copy` }
}

function buildDeleteMessage(projectRefs: number): string {
  const base =
    projectRefs > 0
      ? `In use by ${projectRefs} project${projectRefs === 1 ? '' : 's'} as a default agent. `
      : ''
  return `${base}Sessions or workflow nodes that reference it will show an "agent no longer registered" state. This cannot be undone.`
}
