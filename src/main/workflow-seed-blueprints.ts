import type { WorkflowEdge, WorkflowNode, WorkflowVariable } from '../shared/types'

export interface SeedNode {
  id: string
  type: WorkflowNode['type']
  name: string
  x: number
  y: number
  agent?: string | undefined
  agentFlags?: string | undefined
  prompt?: string | undefined
  message?: string | undefined
  command?: string | undefined
  _roleName?: string | undefined
  // base fields
  continueOnError?: boolean | undefined
  timeout?: number | undefined
  retryCount?: number | undefined
  retryDelayMs?: number | undefined
  // agent
  skillId?: string | undefined
  // condition
  conditionMode?: 'exitCode' | 'outputMatch' | undefined
  conditionPattern?: string | undefined
}

export interface SeedWorkflowBlueprint {
  id: string
  name: string
  description: string
  nodes: SeedNode[]
  edges: WorkflowEdge[]
  variables?: WorkflowVariable[] | undefined
}

export const SEED_WORKFLOWS: SeedWorkflowBlueprint[] = [
  {
    id: 'seed-wf-bug-fix',
    name: 'Autonomous Bug Fix',
    description: 'Reproduce a bug, write a failing test, then loop fix→test until green.',
    nodes: [
      {
        id: 'repro',
        type: 'agent',
        name: 'Reproduce',
        x: 0,
        y: 0,
        agent: 'claude-code',
        continueOnError: true,
        timeout: 300000,
        prompt:
          'Goal: reproduce the bug {{BUG_DESC}} in {{TARGET_PATH}}.\nConstraints: do NOT fix anything yet.\nDone when: you can state exact reproduction steps.\nEnd with a ## SUMMARY of the repro steps.',
      },
      {
        id: 'write_test',
        type: 'agent',
        name: 'Write failing test',
        x: 220,
        y: 0,
        agent: 'claude-code',
        _roleName: 'Tester',
        retryCount: 1,
        timeout: 300000,
        prompt:
          'Goal: add a failing automated test that captures the bug.\nConstraints: it must fail for the right reason; do not touch production code.\nDone when: the new test exists and fails.\nEnd with a ## SUMMARY (test file + name).',
      },
      {
        id: 'fix',
        type: 'agent',
        name: 'Fix root cause',
        x: 440,
        y: 0,
        agent: 'codex',
        _roleName: 'Developer',
        retryCount: 1,
        timeout: 600000,
        prompt:
          'Goal: fix the root cause so the failing test passes (use the context).\nConstraints: do not weaken or delete the test; minimal change.\nDone when: the fix is applied.\nEnd with a ## SUMMARY (what changed and why).',
      },
      {
        id: 'run_tests',
        type: 'shell',
        name: 'Run tests',
        x: 660,
        y: 0,
        command: '{{TEST_CMD}}',
        continueOnError: true,
        timeout: 600000,
      },
      {
        id: 'cond_pass',
        type: 'condition',
        name: 'Tests pass?',
        x: 880,
        y: 0,
        conditionMode: 'exitCode',
      },
      {
        id: 'commit',
        type: 'checkpoint',
        name: 'Review & commit',
        x: 1100,
        y: 0,
        message: 'Tests pass. Review the diff, then commit.',
      },
      {
        id: 'escape_fix',
        type: 'checkpoint',
        name: 'Did not converge',
        x: 880,
        y: 160,
        message: 'Tests still failing after 5 fix attempts — review state.',
      },
    ],
    edges: [
      { id: 'e1', fromNodeId: 'repro', toNodeId: 'write_test' },
      { id: 'e2', fromNodeId: 'write_test', toNodeId: 'fix' },
      { id: 'e3', fromNodeId: 'fix', toNodeId: 'run_tests' },
      { id: 'e4', fromNodeId: 'run_tests', toNodeId: 'cond_pass' },
      { id: 'e5', fromNodeId: 'cond_pass', toNodeId: 'commit', branch: 'true' },
      {
        id: 'e6',
        fromNodeId: 'cond_pass',
        toNodeId: 'fix',
        branch: 'false',
        edgeType: 'loop',
        maxIterations: 5,
      },
      { id: 'e7', fromNodeId: 'cond_pass', toNodeId: 'escape_fix', branch: 'false' },
    ],
    variables: [
      { name: 'BUG_DESC', label: 'Describe the bug', type: 'text', required: true },
      { name: 'TARGET_PATH', label: 'Focus path', type: 'path' },
      { name: 'TEST_CMD', label: 'Test command', type: 'string', default: 'npm test' },
    ],
  },
]
