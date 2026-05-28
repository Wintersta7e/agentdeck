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
  {
    id: 'seed-wf-feature-pipeline',
    name: 'Feature Pipeline',
    description:
      'Gated cross-agent pipeline: plan (Architect) → approve → build (Codex) → review → tests, with dual recovery loops back to build and a final ship gate.',
    nodes: [
      {
        id: 'plan',
        type: 'agent',
        name: 'Plan feature',
        x: 0,
        y: 0,
        agent: 'claude-code',
        _roleName: 'Architect',
        timeout: 300000,
        prompt:
          'Goal: produce an implementation plan for {{FEATURE_DESC}} in {{TARGET_PATH}}.\nConstraints: list files to change, approach, and risks; no code yet.\nDone when: plan is complete.\nEnd with a ## SUMMARY (numbered plan).',
      },
      {
        id: 'approve_plan',
        type: 'checkpoint',
        name: 'Approve plan',
        x: 220,
        y: 0,
        message: 'Review the implementation plan before building.',
      },
      {
        id: 'build',
        type: 'agent',
        name: 'Build feature',
        x: 440,
        y: 0,
        agent: 'codex',
        _roleName: 'Developer',
        retryCount: 1,
        timeout: 600000,
        prompt:
          'Goal: implement the approved plan (in context).\nConstraints: stay within the plan scope; follow existing patterns.\nDone when: implemented.\nEnd with a ## SUMMARY (files changed and how).',
      },
      {
        id: 'review',
        type: 'agent',
        name: 'Review implementation',
        x: 660,
        y: 0,
        agent: 'claude-code',
        _roleName: 'Reviewer',
        timeout: 300000,
        prompt:
          'Goal: review the implementation for correctness, bugs, and convention adherence.\nConstraints: be specific (file:line); check against the plan in context.\nDone when: reviewed.\nEnd with a ## SUMMARY and a final line REVIEW_PASS or REVIEW_FAIL: <reasons>.',
      },
      {
        id: 'cond_review',
        type: 'condition',
        name: 'Review passed?',
        x: 880,
        y: 0,
        conditionMode: 'outputMatch',
        conditionPattern: 'REVIEW_PASS',
      },
      {
        id: 'run_tests',
        type: 'shell',
        name: 'Run tests',
        x: 1100,
        y: 0,
        command: '{{TEST_CMD}}',
        continueOnError: true,
        timeout: 600000,
      },
      {
        id: 'cond_tests',
        type: 'condition',
        name: 'Tests green?',
        x: 1320,
        y: 0,
        conditionMode: 'exitCode',
      },
      {
        id: 'ship',
        type: 'checkpoint',
        name: 'Ship',
        x: 1540,
        y: 0,
        message: 'Feature complete, review clean, tests green. Ship?',
      },
      {
        id: 'escape_build',
        type: 'checkpoint',
        name: 'Did not converge',
        x: 880,
        y: 220,
        message: "Build didn't pass review/tests after 4 attempts — review.",
      },
    ],
    edges: [
      { id: 'fp_e1', fromNodeId: 'plan', toNodeId: 'approve_plan' },
      { id: 'fp_e2', fromNodeId: 'approve_plan', toNodeId: 'build' },
      { id: 'fp_e3', fromNodeId: 'build', toNodeId: 'review' },
      { id: 'fp_e4', fromNodeId: 'review', toNodeId: 'cond_review' },
      { id: 'fp_e5', fromNodeId: 'cond_review', toNodeId: 'run_tests', branch: 'true' },
      {
        id: 'fp_e6',
        fromNodeId: 'cond_review',
        toNodeId: 'build',
        branch: 'false',
        edgeType: 'loop',
        maxIterations: 4,
      },
      { id: 'fp_e7', fromNodeId: 'cond_review', toNodeId: 'escape_build', branch: 'false' },
      { id: 'fp_e8', fromNodeId: 'run_tests', toNodeId: 'cond_tests' },
      { id: 'fp_e9', fromNodeId: 'cond_tests', toNodeId: 'ship', branch: 'true' },
      {
        id: 'fp_e10',
        fromNodeId: 'cond_tests',
        toNodeId: 'build',
        branch: 'false',
        edgeType: 'loop',
        maxIterations: 4,
      },
      { id: 'fp_e11', fromNodeId: 'cond_tests', toNodeId: 'escape_build', branch: 'false' },
    ],
    variables: [
      { name: 'FEATURE_DESC', label: 'Feature description', type: 'text', required: true },
      { name: 'TARGET_PATH', label: 'Target path', type: 'path' },
      { name: 'TEST_CMD', label: 'Test command', type: 'string', default: 'npm test' },
    ],
  },
  {
    id: 'seed-wf-parallel-review',
    name: 'Parallel Deep Review',
    description:
      'Fans four reviewers (bugs, security, perf, types) out concurrently from a scope step, joins them into a synthesis, then gates before a Codex fix and re-test.',
    nodes: [
      {
        id: 'scope',
        type: 'shell',
        name: 'Scope codebase',
        x: 0,
        y: 0,
        command:
          'if [ "{{DIFF_ONLY}}" = "no" ]; then git -C {{TARGET_PATH}} ls-files; else git -C {{TARGET_PATH}} diff HEAD; fi',
        continueOnError: true,
        timeout: 60000,
      },
      {
        id: 'rev_bugs',
        type: 'agent',
        name: 'Review: bugs',
        x: 220,
        y: -330,
        agent: 'claude-code',
        _roleName: 'Reviewer',
        timeout: 300000,
        prompt:
          'Goal: review the scoped code (in context) for correctness and logic bugs.\nConstraints: be specific — cite file:line for every finding.\nDone when: reviewed.\nEnd with a ## SUMMARY: findings as "file:line — severity — issue", ≤ 2.5 KB.',
      },
      {
        id: 'rev_security',
        type: 'agent',
        name: 'Review: security',
        x: 220,
        y: -110,
        agent: 'claude-code',
        _roleName: 'Security Auditor',
        timeout: 300000,
        prompt:
          'Goal: review the scoped code (in context) for security vulnerabilities — injection, path traversal, secret handling, unsafe IPC.\nConstraints: be specific — cite file:line for every finding.\nDone when: reviewed.\nEnd with a ## SUMMARY: findings as "file:line — severity — issue", ≤ 2.5 KB.',
      },
      {
        id: 'rev_perf',
        type: 'agent',
        name: 'Review: performance',
        x: 220,
        y: 110,
        agent: 'claude-code',
        _roleName: 'Reviewer',
        timeout: 300000,
        prompt:
          'Goal: review the scoped code (in context) for performance issues — hot loops, N+1 queries, memory leaks, unnecessary work.\nConstraints: be specific — cite file:line for every finding.\nDone when: reviewed.\nEnd with a ## SUMMARY: findings as "file:line — severity — issue", ≤ 2.5 KB.',
      },
      {
        id: 'rev_types',
        type: 'agent',
        name: 'Review: types',
        x: 220,
        y: 330,
        agent: 'claude-code',
        _roleName: 'Reviewer',
        timeout: 300000,
        prompt:
          'Goal: review the scoped code (in context) for type-safety issues and API/interface design problems.\nConstraints: be specific — cite file:line for every finding.\nDone when: reviewed.\nEnd with a ## SUMMARY: findings as "file:line — severity — issue", ≤ 2.5 KB.',
      },
      {
        id: 'synthesize',
        type: 'agent',
        name: 'Synthesize findings',
        x: 440,
        y: 0,
        agent: 'claude-code',
        timeout: 300000,
        prompt:
          'Goal: merge the four review summaries from context (labelled by node: rev_bugs, rev_security, rev_perf, rev_types).\nConstraints: deduplicate overlapping findings, rank by severity, drop noise.\nDone when: a unified prioritized list is produced.\nEnd with a ## SUMMARY: prioritized fix list.',
      },
      {
        id: 'approve_fixes',
        type: 'checkpoint',
        name: 'Approve fixes',
        x: 660,
        y: 0,
        message: 'Review prioritized findings; approve which to fix.',
      },
      {
        id: 'fix',
        type: 'agent',
        name: 'Apply fixes',
        x: 880,
        y: 0,
        agent: 'codex',
        _roleName: 'Developer',
        retryCount: 1,
        timeout: 600000,
        prompt:
          'Goal: fix the approved findings (in context).\nConstraints: minimal, scoped changes; do not expand scope beyond approved findings.\nDone when: applied.\nEnd with a ## SUMMARY (what was fixed).',
      },
      {
        id: 'retest',
        type: 'shell',
        name: 'Re-test',
        x: 1100,
        y: 0,
        command: '{{TEST_CMD}}',
        continueOnError: true,
        timeout: 600000,
      },
    ],
    edges: [
      { id: 'pr_e1', fromNodeId: 'scope', toNodeId: 'rev_bugs' },
      { id: 'pr_e2', fromNodeId: 'scope', toNodeId: 'rev_security' },
      { id: 'pr_e3', fromNodeId: 'scope', toNodeId: 'rev_perf' },
      { id: 'pr_e4', fromNodeId: 'scope', toNodeId: 'rev_types' },
      { id: 'pr_e5', fromNodeId: 'rev_bugs', toNodeId: 'synthesize' },
      { id: 'pr_e6', fromNodeId: 'rev_security', toNodeId: 'synthesize' },
      { id: 'pr_e7', fromNodeId: 'rev_perf', toNodeId: 'synthesize' },
      { id: 'pr_e8', fromNodeId: 'rev_types', toNodeId: 'synthesize' },
      { id: 'pr_e9', fromNodeId: 'synthesize', toNodeId: 'approve_fixes' },
      { id: 'pr_e10', fromNodeId: 'approve_fixes', toNodeId: 'fix' },
      { id: 'pr_e11', fromNodeId: 'fix', toNodeId: 'retest' },
    ],
    variables: [
      { name: 'TARGET_PATH', label: 'Target path', type: 'path', required: true },
      {
        name: 'DIFF_ONLY',
        label: 'Scope',
        type: 'choice',
        choices: ['yes', 'no'],
        default: 'yes',
      },
      { name: 'TEST_CMD', label: 'Test command', type: 'string', default: 'npm test' },
    ],
  },
]
