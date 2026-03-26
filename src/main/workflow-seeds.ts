import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from './logger'
import type { Workflow, WorkflowNode, WorkflowEdge, WorkflowVariable } from '../shared/types'
import type { AppStore } from './project-store'
import { getRolesFromStore } from './project-store'
import { getWorkflowsDir, saveWorkflow } from './workflow-store'

const log = createLogger('workflow-seeds')

const WORKFLOW_SEED_VERSION = 3

interface SeedNode {
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
}

interface SeedWorkflowBlueprint {
  id: string
  name: string
  description: string
  nodes: SeedNode[]
  edges: WorkflowEdge[]
  variables?: WorkflowVariable[] | undefined
}

const SEED_WORKFLOWS: SeedWorkflowBlueprint[] = [
  // 1. Lint & Fix
  {
    id: 'seed-wf-lint-fix',
    name: 'Lint & Fix',
    description: 'Run the linter, fix all errors, then verify the fixes.',
    nodes: [
      {
        id: 'seed-wf-lint-fix-n1',
        type: 'agent',
        name: 'Run Linter',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Run this project's linter and type-checker. Report every error and warning with file path and line number.\nConstraints: If no linter config exists, detect the language and use its standard linter (eslint, ruff, clippy, etc.). Don't fix anything yet.\nDone when: Complete list of all errors and warnings.",
      },
      {
        id: 'seed-wf-lint-fix-n2',
        type: 'agent',
        name: 'Fix Errors',
        x: 350,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Fix every lint and type error from the previous step.\nConstraints: Make minimal changes \u2014 fix only the reported errors. Don't refactor, rename, or improve surrounding code.\nDone when: All reported errors are fixed.",
      },
      {
        id: 'seed-wf-lint-fix-n3',
        type: 'agent',
        name: 'Verify Fixes',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Re-run the linter and type-checker.\nConstraints: Report only \u2014 don't make any changes.\nDone when: Confirm zero errors, or list any remaining issues.",
      },
    ],
    edges: [
      {
        id: 'seed-wf-lint-fix-e1',
        fromNodeId: 'seed-wf-lint-fix-n1',
        toNodeId: 'seed-wf-lint-fix-n2',
      },
      {
        id: 'seed-wf-lint-fix-e2',
        fromNodeId: 'seed-wf-lint-fix-n2',
        toNodeId: 'seed-wf-lint-fix-n3',
      },
    ],
  },

  // 2. Code Review & Fix
  {
    id: 'seed-wf-code-review',
    name: 'Code Review & Fix',
    description: 'Review code for issues, get human approval, fix them, then run tests.',
    nodes: [
      {
        id: 'seed-wf-code-review-n1',
        type: 'agent',
        name: 'Review Code',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Review the codebase for bugs, security issues, and performance problems.\nConstraints: Focus on actual bugs and security risks, not style or formatting. Rate each finding as critical/high/medium/low. Include file path, line number, and a concrete fix suggestion.\nDone when: Complete findings list with severity ratings.',
      },
      {
        id: 'seed-wf-code-review-n2',
        type: 'checkpoint',
        name: 'Approve Findings',
        x: 350,
        y: 200,
        message:
          'Review the findings above. Remove or adjust any you disagree with before proceeding.',
      },
      {
        id: 'seed-wf-code-review-n3',
        type: 'agent',
        name: 'Fix Issues',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Fix all issues from the approved review findings.\nConstraints: Address critical and high severity first. Make minimal, targeted changes. Don't refactor beyond what's needed for the fix.\nDone when: All approved findings are addressed.",
      },
      {
        id: 'seed-wf-code-review-n4',
        type: 'agent',
        name: 'Run Tests',
        x: 850,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Run the full test suite.\nConstraints: Don't modify any tests \u2014 just run them and report.\nDone when: Report passes/failures/skips with details on any failures.",
      },
    ],
    edges: [
      {
        id: 'seed-wf-code-review-e1',
        fromNodeId: 'seed-wf-code-review-n1',
        toNodeId: 'seed-wf-code-review-n2',
      },
      {
        id: 'seed-wf-code-review-e2',
        fromNodeId: 'seed-wf-code-review-n2',
        toNodeId: 'seed-wf-code-review-n3',
      },
      {
        id: 'seed-wf-code-review-e3',
        fromNodeId: 'seed-wf-code-review-n3',
        toNodeId: 'seed-wf-code-review-n4',
      },
    ],
  },

  // 3. Feature from Ticket
  {
    id: 'seed-wf-feature-ticket',
    name: 'Feature from Ticket',
    description: 'Read a ticket spec, plan the implementation, get approval, build it, then test.',
    nodes: [
      {
        id: 'seed-wf-feature-ticket-n1',
        type: 'agent',
        name: 'Read & Plan',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Read the spec at `{{TICKET_PATH}}` and create an implementation plan.\nConstraints: Plan should include: files to create/modify, key design decisions, build order, edge cases to handle. Don't write code yet.\nDone when: Detailed step-by-step implementation plan.",
      },
      {
        id: 'seed-wf-feature-ticket-n2',
        type: 'checkpoint',
        name: 'Approve Plan',
        x: 350,
        y: 200,
        message: 'Review the implementation plan. Adjust scope or approach before proceeding.',
      },
      {
        id: 'seed-wf-feature-ticket-n3',
        type: 'agent',
        name: 'Implement',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Implement the approved plan.\nConstraints: Follow the plan's build order. Handle all specified edge cases. Write clean, production-ready code.\nDone when: All planned changes are implemented and the code compiles.",
      },
      {
        id: 'seed-wf-feature-ticket-n4',
        type: 'agent',
        name: 'Write & Run Tests',
        x: 850,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Write tests covering the new feature and run the full test suite.\nConstraints: Cover happy paths, edge cases, and error paths. Use the project's existing test framework.\nDone when: All new tests pass and no existing tests are broken.",
      },
    ],
    edges: [
      {
        id: 'seed-wf-feature-ticket-e1',
        fromNodeId: 'seed-wf-feature-ticket-n1',
        toNodeId: 'seed-wf-feature-ticket-n2',
      },
      {
        id: 'seed-wf-feature-ticket-e2',
        fromNodeId: 'seed-wf-feature-ticket-n2',
        toNodeId: 'seed-wf-feature-ticket-n3',
      },
      {
        id: 'seed-wf-feature-ticket-e3',
        fromNodeId: 'seed-wf-feature-ticket-n3',
        toNodeId: 'seed-wf-feature-ticket-n4',
      },
    ],
    variables: [
      { name: 'TICKET_PATH', label: 'Path to ticket/spec file', type: 'path', required: true },
    ],
  },

  // 4. Plan & Implement
  {
    id: 'seed-wf-plan-implement',
    name: 'Plan & Implement',
    description: 'Create an implementation plan, get approval, build it, then test.',
    nodes: [
      {
        id: 'seed-wf-plan-implement-n1',
        type: 'agent',
        name: 'Create Plan',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Create an implementation plan for: `{{FEATURE_DESC}}`.\nConstraints: Analyze the existing codebase first. Plan should cover: files to create/modify, component design, data flow, and testing strategy. Don't write code yet.\nDone when: Complete plan with file list, build order, and test strategy.",
      },
      {
        id: 'seed-wf-plan-implement-n2',
        type: 'checkpoint',
        name: 'Approve Plan',
        x: 350,
        y: 200,
        message: 'Review the plan and adjust before implementation.',
      },
      {
        id: 'seed-wf-plan-implement-n3',
        type: 'agent',
        name: 'Implement',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Implement the approved plan step by step.\nConstraints: Follow the build order exactly. Keep changes focused \u2014 don't add features beyond the plan.\nDone when: All planned changes implemented and compiling.",
      },
      {
        id: 'seed-wf-plan-implement-n4',
        type: 'agent',
        name: 'Write & Run Tests',
        x: 850,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Write tests for the new feature and run the full suite.\nConstraints: Match the project's existing test patterns. Cover success and failure paths.\nDone when: All tests pass.",
      },
    ],
    edges: [
      {
        id: 'seed-wf-plan-implement-e1',
        fromNodeId: 'seed-wf-plan-implement-n1',
        toNodeId: 'seed-wf-plan-implement-n2',
      },
      {
        id: 'seed-wf-plan-implement-e2',
        fromNodeId: 'seed-wf-plan-implement-n2',
        toNodeId: 'seed-wf-plan-implement-n3',
      },
      {
        id: 'seed-wf-plan-implement-e3',
        fromNodeId: 'seed-wf-plan-implement-n3',
        toNodeId: 'seed-wf-plan-implement-n4',
      },
    ],
    variables: [
      {
        name: 'FEATURE_DESC',
        label: 'Describe the feature to implement',
        type: 'text',
        required: true,
      },
    ],
  },

  // 5. Security Audit
  {
    id: 'seed-wf-security-audit',
    name: 'Security Audit',
    description: 'Scan for vulnerabilities, fix critical/high issues, then verify with tests.',
    nodes: [
      {
        id: 'seed-wf-security-audit-n1',
        type: 'agent',
        name: 'Scan',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Audit this project for security vulnerabilities.\nConstraints: Check for: injection (SQL, XSS, command), hardcoded secrets, insecure dependencies, authentication/authorization flaws, data exposure, CSRF, path traversal. Rate each as critical/high/medium/low with file path and line.\nDone when: Complete vulnerability report.',
      },
      {
        id: 'seed-wf-security-audit-n2',
        type: 'agent',
        name: 'Fix Critical/High',
        x: 350,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Fix all critical and high severity findings.\nConstraints: For each fix, explain what was vulnerable and how the fix addresses it. Don't downgrade severity \u2014 fix or document a mitigation.\nDone when: All critical and high issues resolved.",
      },
      {
        id: 'seed-wf-security-audit-n3',
        type: 'agent',
        name: 'Run Tests',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Run the full test suite to verify fixes don't break anything.\nDone when: All tests pass.",
      },
    ],
    edges: [
      {
        id: 'seed-wf-security-audit-e1',
        fromNodeId: 'seed-wf-security-audit-n1',
        toNodeId: 'seed-wf-security-audit-n2',
      },
      {
        id: 'seed-wf-security-audit-e2',
        fromNodeId: 'seed-wf-security-audit-n2',
        toNodeId: 'seed-wf-security-audit-n3',
      },
    ],
  },

  // 6. Refactor Pass
  {
    id: 'seed-wf-refactor-pass',
    name: 'Refactor Pass',
    description: 'Analyze code for refactoring, get approval, refactor, then test.',
    nodes: [
      {
        id: 'seed-wf-refactor-pass-n1',
        type: 'agent',
        name: 'Analyze',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Analyze the codebase for refactoring opportunities.\nConstraints: Look for: duplicated code, functions >50 lines, poor naming, missing abstractions, dead code, inconsistent patterns. Prioritize by impact. Don't make changes yet.\nDone when: Prioritized list of refactoring opportunities with effort estimates.",
      },
      {
        id: 'seed-wf-refactor-pass-n2',
        type: 'checkpoint',
        name: 'Approve',
        x: 350,
        y: 200,
        message: "Review the refactoring proposals. Remove any you don't want.",
      },
      {
        id: 'seed-wf-refactor-pass-n3',
        type: 'agent',
        name: 'Refactor',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Execute the approved refactoring.\nConstraints: One change at a time. Update all imports, references, and tests after each change. Preserve all existing behavior \u2014 no functional changes.\nDone when: All approved refactoring complete.',
      },
      {
        id: 'seed-wf-refactor-pass-n4',
        type: 'agent',
        name: 'Run Tests',
        x: 850,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Run the full test suite.\nDone when: All tests pass, confirming no regressions.',
      },
    ],
    edges: [
      {
        id: 'seed-wf-refactor-pass-e1',
        fromNodeId: 'seed-wf-refactor-pass-n1',
        toNodeId: 'seed-wf-refactor-pass-n2',
      },
      {
        id: 'seed-wf-refactor-pass-e2',
        fromNodeId: 'seed-wf-refactor-pass-n2',
        toNodeId: 'seed-wf-refactor-pass-n3',
      },
      {
        id: 'seed-wf-refactor-pass-e3',
        fromNodeId: 'seed-wf-refactor-pass-n3',
        toNodeId: 'seed-wf-refactor-pass-n4',
      },
    ],
  },

  // 7. Bug Triage
  {
    id: 'seed-wf-bug-triage',
    name: 'Bug Triage',
    description: 'Investigate a bug, fix the root cause, then write a regression test.',
    nodes: [
      {
        id: 'seed-wf-bug-triage-n1',
        type: 'agent',
        name: 'Investigate',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Investigate this bug: `{{BUG_DESC}}`.\nConstraints: Trace the root cause through the code. Identify: affected code paths, trigger conditions, expected vs actual behavior, and the specific line(s) where the bug occurs.\nDone when: Root cause identified with a clear explanation.',
      },
      {
        id: 'seed-wf-bug-triage-n2',
        type: 'agent',
        name: 'Fix',
        x: 350,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Fix the root cause identified above.\nConstraints: Minimal change \u2014 fix the bug without refactoring surrounding code.\nDone when: Bug is fixed.',
      },
      {
        id: 'seed-wf-bug-triage-n3',
        type: 'agent',
        name: 'Regression Test',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Write a test that reproduces the original bug and verifies the fix, then run the full suite.\nDone when: Regression test passes and no existing tests break.',
      },
    ],
    edges: [
      {
        id: 'seed-wf-bug-triage-e1',
        fromNodeId: 'seed-wf-bug-triage-n1',
        toNodeId: 'seed-wf-bug-triage-n2',
      },
      {
        id: 'seed-wf-bug-triage-e2',
        fromNodeId: 'seed-wf-bug-triage-n2',
        toNodeId: 'seed-wf-bug-triage-n3',
      },
    ],
    variables: [
      { name: 'BUG_DESC', label: 'Describe the bug to investigate', type: 'text', required: true },
    ],
  },

  // 8. Test Coverage Expansion
  {
    id: 'seed-wf-test-coverage',
    name: 'Test Coverage Expansion',
    description: 'Find untested code, write tests, and verify coverage improvement.',
    nodes: [
      {
        id: 'seed-wf-test-coverage-n1',
        type: 'agent',
        name: 'Analyze Gaps',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Identify code paths with no test coverage.\nConstraints: Focus on business logic, not boilerplate. List each untested function/method with file path and why it matters. Prioritize by risk.\nDone when: Prioritized list of untested code paths.',
      },
      {
        id: 'seed-wf-test-coverage-n2',
        type: 'agent',
        name: 'Write Tests',
        x: 350,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Write tests for the gaps identified above.\nConstraints: Start with the highest-risk paths. Use the project's existing test framework and patterns. Cover success paths, edge cases, and error handling.\nDone when: Tests written for all identified gaps.",
      },
      {
        id: 'seed-wf-test-coverage-n3',
        type: 'agent',
        name: 'Verify Coverage',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Run the full test suite and report coverage.\nDone when: Test results and coverage summary reported. List any remaining critical gaps.',
      },
    ],
    edges: [
      {
        id: 'seed-wf-test-coverage-e1',
        fromNodeId: 'seed-wf-test-coverage-n1',
        toNodeId: 'seed-wf-test-coverage-n2',
      },
      {
        id: 'seed-wf-test-coverage-e2',
        fromNodeId: 'seed-wf-test-coverage-n2',
        toNodeId: 'seed-wf-test-coverage-n3',
      },
    ],
  },

  // 9. Dependency Update
  {
    id: 'seed-wf-dep-update',
    name: 'Dependency Update',
    description: 'Check for outdated dependencies, update them, and verify nothing breaks.',
    nodes: [
      {
        id: 'seed-wf-dep-update-n1',
        type: 'agent',
        name: 'Check Outdated',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: List all outdated dependencies with current vs latest versions.\nConstraints: Check both direct and dev dependencies. Flag any with breaking changes (major version bumps) or security advisories.\nDone when: Complete list with version diffs and risk assessment.',
      },
      {
        id: 'seed-wf-dep-update-n2',
        type: 'checkpoint',
        name: 'Approve Updates',
        x: 350,
        y: 200,
        message: "Review the dependency list. Remove any you don't want updated.",
      },
      {
        id: 'seed-wf-dep-update-n3',
        type: 'agent',
        name: 'Update Dependencies',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Update the approved dependencies.\nConstraints: Update one at a time. For major version bumps, check the changelog for breaking changes and fix any.\nDone when: All approved dependencies updated, lockfile regenerated.',
      },
      {
        id: 'seed-wf-dep-update-n4',
        type: 'agent',
        name: 'Run Tests',
        x: 850,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Run the full test suite and build.\nDone when: All tests pass and build succeeds.',
      },
    ],
    edges: [
      {
        id: 'seed-wf-dep-update-e1',
        fromNodeId: 'seed-wf-dep-update-n1',
        toNodeId: 'seed-wf-dep-update-n2',
      },
      {
        id: 'seed-wf-dep-update-e2',
        fromNodeId: 'seed-wf-dep-update-n2',
        toNodeId: 'seed-wf-dep-update-n3',
      },
      {
        id: 'seed-wf-dep-update-e3',
        fromNodeId: 'seed-wf-dep-update-n3',
        toNodeId: 'seed-wf-dep-update-n4',
      },
    ],
  },

  // 10. Documentation Pass
  {
    id: 'seed-wf-docs',
    name: 'Documentation Pass',
    description: 'Analyze code for missing docs, generate them, and verify accuracy.',
    nodes: [
      {
        id: 'seed-wf-docs-n1',
        type: 'agent',
        name: 'Analyze',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Identify public APIs, functions, and modules missing documentation.\nConstraints: Focus on exported functions, class methods, and module-level docs. Don't flag internal/private helpers.\nDone when: List of undocumented public interfaces with file paths.",
      },
      {
        id: 'seed-wf-docs-n2',
        type: 'agent',
        name: 'Generate Docs',
        x: 350,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Write documentation for the identified gaps.\nConstraints: Match the project's existing doc style (JSDoc, docstrings, README sections, etc.). Be accurate \u2014 read the implementation before documenting. Don't document implementation details, only the public contract.\nDone when: All identified gaps documented.",
      },
      {
        id: 'seed-wf-docs-n3',
        type: 'agent',
        name: 'Verify',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Review all generated documentation for accuracy.\nConstraints: Cross-check each doc comment against the actual implementation. Flag any inaccuracies.\nDone when: All docs verified as accurate.',
      },
    ],
    edges: [
      {
        id: 'seed-wf-docs-e1',
        fromNodeId: 'seed-wf-docs-n1',
        toNodeId: 'seed-wf-docs-n2',
      },
      {
        id: 'seed-wf-docs-e2',
        fromNodeId: 'seed-wf-docs-n2',
        toNodeId: 'seed-wf-docs-n3',
      },
    ],
  },

  // 11. Performance Audit
  {
    id: 'seed-wf-perf-audit',
    name: 'Performance Audit',
    description: 'Profile the codebase for performance issues, optimize, and benchmark.',
    nodes: [
      {
        id: 'seed-wf-perf-audit-n1',
        type: 'agent',
        name: 'Profile',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Identify performance bottlenecks in this codebase.\nConstraints: Look for: O(n\u00B2) loops, unnecessary re-renders, blocking I/O, missing caching, large bundle imports, memory leaks. Rate each by impact (high/medium/low) with file path and line.\nDone when: Prioritized list of performance issues.',
      },
      {
        id: 'seed-wf-perf-audit-n2',
        type: 'checkpoint',
        name: 'Approve',
        x: 350,
        y: 200,
        message: "Review the findings. Remove optimizations you don't want.",
      },
      {
        id: 'seed-wf-perf-audit-n3',
        type: 'agent',
        name: 'Optimize',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Implement the approved performance optimizations.\nConstraints: One optimization at a time. Measure or explain the expected improvement. Don't sacrifice readability for micro-optimizations.\nDone when: All approved optimizations implemented.",
      },
      {
        id: 'seed-wf-perf-audit-n4',
        type: 'agent',
        name: 'Benchmark',
        x: 850,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Run tests and any available benchmarks.\nDone when: All tests pass. Report any measurable improvements.',
      },
    ],
    edges: [
      {
        id: 'seed-wf-perf-audit-e1',
        fromNodeId: 'seed-wf-perf-audit-n1',
        toNodeId: 'seed-wf-perf-audit-n2',
      },
      {
        id: 'seed-wf-perf-audit-e2',
        fromNodeId: 'seed-wf-perf-audit-n2',
        toNodeId: 'seed-wf-perf-audit-n3',
      },
      {
        id: 'seed-wf-perf-audit-e3',
        fromNodeId: 'seed-wf-perf-audit-n3',
        toNodeId: 'seed-wf-perf-audit-n4',
      },
    ],
  },

  // 12. Release Prep
  {
    id: 'seed-wf-release-prep',
    name: 'Release Prep',
    description: 'Generate changelog, bump version, run final checks, and prepare for release.',
    nodes: [
      {
        id: 'seed-wf-release-prep-n1',
        type: 'shell',
        name: 'Git Log',
        x: 100,
        y: 200,
        command: 'git log --oneline --since="1 month ago"',
      },
      {
        id: 'seed-wf-release-prep-n2',
        type: 'agent',
        name: 'Generate Changelog',
        x: 350,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Goal: Generate a changelog from the git log above.\nConstraints: Group changes by category (features, fixes, refactoring, docs). Use conventional commit format if the project follows it. Be concise \u2014 one line per change.\nDone when: Complete changelog for the release.',
      },
      {
        id: 'seed-wf-release-prep-n3',
        type: 'agent',
        name: 'Final Checks',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Goal: Run the full test suite, linter, and build.\nConstraints: Report any failures. Don't fix anything \u2014 just report.\nDone when: Clean build/test/lint report, or list of issues that need attention.",
      },
      {
        id: 'seed-wf-release-prep-n4',
        type: 'checkpoint',
        name: 'Approve Release',
        x: 850,
        y: 200,
        message: 'Review the changelog and check results. Proceed to tag the release?',
      },
    ],
    edges: [
      {
        id: 'seed-wf-release-prep-e1',
        fromNodeId: 'seed-wf-release-prep-n1',
        toNodeId: 'seed-wf-release-prep-n2',
      },
      {
        id: 'seed-wf-release-prep-e2',
        fromNodeId: 'seed-wf-release-prep-n2',
        toNodeId: 'seed-wf-release-prep-n3',
      },
      {
        id: 'seed-wf-release-prep-e3',
        fromNodeId: 'seed-wf-release-prep-n3',
        toNodeId: 'seed-wf-release-prep-n4',
      },
    ],
    variables: [
      { name: 'VERSION', label: 'Release version (e.g. 1.2.0)', type: 'string', required: true },
    ],
  },
]

export async function seedWorkflows(store: AppStore): Promise<void> {
  const prefs = store.get('appPrefs')
  const currentVersion = prefs.workflowSeedVersion ?? 0
  const rolesVersion = prefs.rolesSeedVersion ?? 0
  const lastRolesVersion = prefs.workflowLastRolesVersion ?? 0
  const rolesChanged = rolesVersion !== lastRolesVersion

  if (currentVersion >= WORKFLOW_SEED_VERSION && !rolesChanged) return

  const roles = getRolesFromStore(store)
  const roleMap = new Map<string, string>()
  for (const r of roles) {
    if (r.builtin) roleMap.set(r.name, r.id)
  }

  // Only delete old seed workflows on upgrade (not fresh install — nothing to delete)
  if (currentVersion > 0) {
    const dir = getWorkflowsDir()
    try {
      const files = await fs.promises.readdir(dir)
      for (const f of files) {
        if (f.startsWith('seed-wf-') && f.endsWith('.json')) {
          await fs.promises.rm(path.join(dir, f), { force: true })
        }
      }
      log.info('Cleared old seed workflows for upgrade')
    } catch (err) {
      log.warn('Failed to clean old seed workflows during upgrade', { err: String(err) })
    }
  }

  let count = 0
  for (const blueprint of SEED_WORKFLOWS) {
    const nodes: WorkflowNode[] = blueprint.nodes.map((n) => {
      const node: WorkflowNode = {
        id: n.id,
        type: n.type,
        name: n.name,
        x: n.x,
        y: n.y,
      }
      if (n.agent !== undefined) node.agent = n.agent as WorkflowNode['agent']
      if (n.agentFlags !== undefined) node.agentFlags = n.agentFlags
      if (n.prompt !== undefined) node.prompt = n.prompt
      if (n.message !== undefined) node.message = n.message
      if (n.command !== undefined) node.command = n.command
      return node
    })

    const workflow: Workflow = {
      id: blueprint.id,
      name: blueprint.name,
      description: blueprint.description,
      nodes,
      edges: blueprint.edges,
      variables: blueprint.variables,
      createdAt: 0,
      updatedAt: 0,
    }

    await saveWorkflow(workflow)
    count++
  }

  const freshPrefs = store.get('appPrefs')
  store.set('appPrefs', {
    ...freshPrefs,
    workflowSeedVersion: WORKFLOW_SEED_VERSION,
    workflowLastRolesVersion: rolesVersion,
  })
  log.info(`Seeded ${String(count)} built-in workflows (v${String(WORKFLOW_SEED_VERSION)})`)
}
