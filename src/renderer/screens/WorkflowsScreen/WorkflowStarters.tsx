import { useCallback } from 'react'
import { Terminal, Bot, Plus } from 'lucide-react'
import type { Workflow, AgentType } from '../../../shared/types'
import { useAppStore } from '../../store/appStore'
import { blankWorkflowDraft, persistAndOpenWorkflow } from '../../utils/workflowUtils'
import './WorkflowStarters.css'

interface Starter {
  id: string
  title: string
  desc: string
  icon: React.ReactNode
  build: () => Workflow
}

const DEFAULT_AGENT: AgentType = 'claude-code'

export function singleAgentDraft(): Workflow {
  const now = Date.now()
  return {
    id: '',
    name: 'Single Agent',
    nodes: [
      {
        id: crypto.randomUUID(),
        type: 'agent',
        name: 'Run an Agent',
        agent: DEFAULT_AGENT,
        prompt: 'Describe what you want the agent to do here.',
        x: 120,
        y: 120,
      },
    ],
    edges: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function buildAndTestDraft(): Workflow {
  const now = Date.now()
  const buildId = crypto.randomUUID()
  const testId = crypto.randomUUID()
  return {
    id: '',
    name: 'Build & Test',
    nodes: [
      { id: buildId, type: 'shell', name: 'Build', command: 'npm run build', x: 120, y: 120 },
      { id: testId, type: 'shell', name: 'Test', command: 'npm test', x: 380, y: 120 },
    ],
    edges: [{ id: crypto.randomUUID(), fromNodeId: buildId, toNodeId: testId }],
    createdAt: now,
    updatedAt: now,
  }
}

const STARTERS: Starter[] = [
  {
    id: 'blank',
    title: 'Blank workflow',
    desc: 'Start from scratch and drag your own nodes onto the canvas.',
    icon: <Plus size={16} />,
    build: blankWorkflowDraft,
  },
  {
    id: 'single-agent',
    title: 'Single agent run',
    desc: 'One agent node — fill in a prompt and run it against a project.',
    icon: <Bot size={16} />,
    build: singleAgentDraft,
  },
  {
    id: 'build-test',
    title: 'Build then test',
    desc: 'A two-step shell pipeline: build artifacts, then run the test suite.',
    icon: <Terminal size={16} />,
    build: buildAndTestDraft,
  },
]

export function WorkflowStarters(): React.JSX.Element {
  const setWorkflows = useAppStore((s) => s.setWorkflows)
  const openWorkflow = useAppStore((s) => s.openWorkflow)

  const handleCreate = useCallback(
    (starter: Starter) => {
      void persistAndOpenWorkflow(starter.build(), setWorkflows, openWorkflow)
    },
    [setWorkflows, openWorkflow],
  )

  return (
    <div className="wf-starters">
      {STARTERS.map((s) => (
        <button
          key={s.id}
          type="button"
          className="wf-starter-card"
          onClick={() => handleCreate(s)}
          aria-label={`Create workflow from "${s.title}" template`}
        >
          <div className="wf-starter-icon" aria-hidden="true">
            {s.icon}
          </div>
          <div className="wf-starter-body">
            <div className="wf-starter-title">{s.title}</div>
            <div className="wf-starter-desc">{s.desc}</div>
          </div>
        </button>
      ))}
    </div>
  )
}
