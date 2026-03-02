/**
 * Test data factories for AgentDeck types.
 */
import type {
  Project,
  Template,
  Role,
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  Session,
  ActivityEvent,
  TemplateCategory,
} from '../shared/types'

let counter = 0
function nextId(prefix = 'test'): string {
  return `${prefix}-${++counter}`
}

export function resetCounter(): void {
  counter = 0
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: nextId('proj'),
    name: 'Test Project',
    path: '/home/rooty/test-project',
    ...overrides,
  }
}

export function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: nextId('tmpl'),
    name: 'Test Template',
    description: 'A test template',
    ...overrides,
  }
}

export function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: nextId('role'),
    name: 'Test Role',
    icon: '🧪',
    persona: 'You are a test role.',
    builtin: false,
    ...overrides,
  }
}

export function makeWorkflowNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id: nextId('node'),
    type: 'agent',
    name: 'Test Node',
    x: 0,
    y: 0,
    ...overrides,
  }
}

export function makeWorkflowEdge(
  from: string,
  to: string,
  overrides: Partial<WorkflowEdge> = {},
): WorkflowEdge {
  return {
    id: nextId('edge'),
    fromNodeId: from,
    toNodeId: to,
    ...overrides,
  }
}

export function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: nextId('wf'),
    name: 'Test Workflow',
    nodes: [],
    edges: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: nextId('sess'),
    projectId: 'proj-1',
    status: 'running',
    startedAt: Date.now(),
    ...overrides,
  }
}

export function makeActivityEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: nextId('evt'),
    type: 'command',
    title: 'Test event',
    detail: 'details',
    status: 'done',
    timestamp: Date.now(),
    ...overrides,
  }
}

/** Helper to make a list of templates with categories for grouping tests */
export function makeCategorizedTemplates(categories: (TemplateCategory | undefined)[]): Template[] {
  return categories.map((cat, i) =>
    makeTemplate({
      name: `Template ${i + 1}`,
      category: cat,
    }),
  )
}
