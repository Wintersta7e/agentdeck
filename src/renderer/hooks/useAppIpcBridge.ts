import { useEffect, useMemo, useRef } from 'react'
import { safeWrite } from '../utils/pty-write'
import { shellQuote } from '../utils/shell-quote'
import { useAppStore } from '../store/appStore'
import { getActiveProjectId } from '../selectors/active-project'
import type { ActivityEvent, WorkflowEvent } from '../../shared/types'

export function useAppIpcBridge(): void {
  const activeProjectId = useAppStore(getActiveProjectId)
  const activateProjectTemplates = useAppStore((s) => s.activateProjectTemplates)

  const sessionIds = useAppStore((s) => Object.keys(s.sessions).join(','))
  const sessionIdList = useMemo(() => (sessionIds ? sessionIds.split(',') : []), [sessionIds])

  const openWorkflowIds = useAppStore((s) => s.openWorkflowIds.join(','))
  const openWorkflowIdList = useMemo(
    () => (openWorkflowIds ? openWorkflowIds.split(',') : []),
    [openWorkflowIds],
  )

  useEffect(() => {
    const unsub = window.agentDeck.onFileDrop((wslPaths: string[]) => {
      const state = useAppStore.getState()
      if (state.currentView !== 'sessions') return
      const sid = state.paneSessions[state.focusedPane]
      if (!sid) return
      safeWrite(sid, wslPaths.map(shellQuote).join(' '))
    })
    return unsub
  }, [])

  useEffect(() => {
    window.agentDeck.workflows
      .getRunning()
      .then((ids) => {
        const store = useAppStore.getState()
        for (const id of ids) {
          store.setWorkflowStatus(id, 'running')
        }
      })
      .catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'app', 'Failed to hydrate workflow state', {
          err: String(err),
        })
      })
  }, [])

  // Hydrate the workflow list on startup. Without this, the Workflows screen
  // shows "No workflows yet" until the user creates/imports/duplicates one —
  // those paths are the only places the renderer historically called
  // `workflows.list()`.
  useEffect(() => {
    window.agentDeck.workflows
      .list()
      .then((workflows) => {
        useAppStore.getState().setWorkflows(workflows)
      })
      .catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'app', 'Failed to load workflows', {
          err: String(err),
        })
      })
  }, [])

  useEffect(() => {
    const unsub = window.agentDeck.wsl.onStatus((data) => {
      useAppStore.getState().setWslAvailable(data.available)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.agentDeck.cost.onUpdate((data) => {
      useAppStore.getState().setSessionUsage(data.sessionId, data.usage)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.agentDeck.security.onEncryptionUnavailable(() => {
      useAppStore
        .getState()
        .addNotification('warning', 'Encryption unavailable - API keys are stored as plaintext')
    })
    return unsub
  }, [])

  useEffect(() => {
    window.agentDeck.theme
      .popMigration()
      .then((migration) => {
        if (!migration) return
        const targetLabel = migration.to === '' ? 'tungsten' : migration.to
        useAppStore
          .getState()
          .addNotification(
            'info',
            `Theme "${migration.from}" was retired in v6.0.0 - switched to "${targetLabel}". Pick a different one in Settings if you like.`,
          )
      })
      .catch((err: unknown) => {
        void window.agentDeck.log.send('warn', 'theme-migration', 'popMigration failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }, [])

  useEffect(() => {
    void activateProjectTemplates(activeProjectId)
  }, [activeProjectId, activateProjectTemplates])

  useEffect(() => {
    window.agentDeck.zoom
      .get()
      .then((factor) => {
        useAppStore.getState().setZoomFactor(factor)
      })
      .catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'app', 'Failed to load zoom', { err: String(err) })
      })
  }, [])

  const ptySubscriptionsRef = useRef<Map<string, () => void>>(new Map())

  useEffect(() => {
    const subscriptions = ptySubscriptionsRef.current

    for (const sid of sessionIdList) {
      if (!subscriptions.has(sid)) {
        const unsub = window.agentDeck.pty.onActivity(sid, (event: ActivityEvent) => {
          useAppStore.getState().addActivityEvent(sid, event)
        })
        subscriptions.set(sid, unsub)
      }
    }

    for (const [sid, unsub] of subscriptions) {
      if (!sessionIdList.includes(sid)) {
        unsub()
        subscriptions.delete(sid)
      }
    }

    return () => {
      for (const unsub of subscriptions.values()) unsub()
      subscriptions.clear()
    }
  }, [sessionIdList])

  const workflowSubscriptionsRef = useRef<Map<string, () => void>>(new Map())

  useEffect(() => {
    const subscriptions = workflowSubscriptionsRef.current

    for (const workflowId of openWorkflowIdList) {
      if (!subscriptions.has(workflowId)) {
        const unsub = window.agentDeck.workflows.onEvent(workflowId, (event: WorkflowEvent) => {
          const store = useAppStore.getState()
          store.addWorkflowLog(workflowId, event)
          const nodeId = event.nodeId
          switch (event.type) {
            case 'workflow:started':
              store.setWorkflowStatus(workflowId, 'running')
              break
            case 'workflow:done':
              store.setWorkflowStatus(workflowId, 'done')
              break
            case 'workflow:error':
              store.setWorkflowStatus(workflowId, 'error')
              break
            case 'workflow:stopped':
              store.setWorkflowStatus(workflowId, 'stopped')
              break
            case 'node:started':
            case 'node:resumed':
              if (nodeId) store.setWorkflowNodeStatus(workflowId, nodeId, 'running')
              break
            case 'node:done':
              if (nodeId) store.setWorkflowNodeStatus(workflowId, nodeId, 'done')
              break
            case 'node:error':
              if (nodeId) store.setWorkflowNodeStatus(workflowId, nodeId, 'error')
              break
            case 'node:paused':
              if (nodeId) store.setWorkflowNodeStatus(workflowId, nodeId, 'paused')
              break
            case 'node:skipped':
              if (nodeId) store.setWorkflowNodeStatus(workflowId, nodeId, 'skipped')
              break
          }
        })
        subscriptions.set(workflowId, unsub)
      }
    }

    for (const [workflowId, unsub] of subscriptions) {
      if (!openWorkflowIdList.includes(workflowId)) {
        unsub()
        subscriptions.delete(workflowId)
      }
    }

    return () => {
      for (const unsub of subscriptions.values()) unsub()
      subscriptions.clear()
    }
  }, [openWorkflowIdList])
}
