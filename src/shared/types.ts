import type { AgentId } from './agents'

export type AgentType = AgentId
export type StackBadge =
  | 'Java'
  | 'JS'
  | 'TS'
  | 'Python'
  | 'Rust'
  | 'Go'
  | '.NET'
  | 'C/C++'
  | 'Ruby'
  | 'PHP'
  | 'Kotlin'
  | 'Swift'
  | 'Dart'
  | 'Agent'
  | 'Other'

export interface StartupCommand {
  id: string
  value: string
}

export interface EnvVar {
  id: string
  key: string
  value: string
  secret: boolean
  /** Set when decryption fails — preserves raw encrypted value so it isn't overwritten. */
  _decryptFailed?: boolean | undefined
}

export interface ProjectIdentity {
  icon: string
  accentColor: string
}

export interface AgentConfig {
  agent: AgentType
  agentFlags?: string | undefined
  isDefault?: boolean | undefined
}

export interface Project {
  id: string
  name: string
  path: string
  pinned?: boolean | undefined
  lastOpened?: number | undefined
  badge?: StackBadge | undefined
  attachedTemplates?: string[] | undefined
  wslDistro?: string | undefined
  notes?: string | undefined
  startupCommands?: StartupCommand[] | undefined
  envVars?: EnvVar[] | undefined
  agent?: AgentType | undefined
  agentFlags?: string | undefined
  agents?: AgentConfig[] | undefined
  contextFile?: string | undefined
  identity?: ProjectIdentity | undefined
  autoOpen?: boolean | undefined
  scrollbackLines?: number | undefined
  fontSize?: number | undefined
  shell?: string | undefined
  meta?: ProjectMeta | undefined
}

export type TemplateCategory =
  | 'Orient'
  | 'Review'
  | 'Fix'
  | 'Test'
  | 'Refactor'
  | 'Debug'
  | 'Docs'
  | 'Git'

/**
 * Legacy flat Template shape — persisted in electron-store under the `templates`
 * key. Consumers will be rewired to the new three-tier Template shape
 * (TemplateFile / Template / TemplateDraft) in a later phase of the v6.1.0
 * session-UI rework. Kept here so existing code compiles during the migration.
 *
 * @deprecated Use `TemplateFile` (persisted) / `Template` (loaded) / `TemplateDraft` (input).
 */
export interface LegacyTemplate {
  id: string
  name: string
  description: string
  content?: string | undefined
  category?: TemplateCategory | undefined
}

// ── Template types (v6.1.0 file-based) ─────────────────────────────
export type TemplateScope = 'user' | 'project'

/** Persisted JSON on disk. Derived fields are NOT in the file. */
export interface TemplateFile {
  id: string
  name: string
  description: string
  content: string
  category?: TemplateCategory | undefined
  usageCount: number
  lastUsedAt: number
  pinned: boolean
}

/** Renderer-facing shape — TemplateFile + fields derived at load time. */
export interface Template extends TemplateFile {
  scope: TemplateScope
  projectId: string | null
  path: string
  mtimeMs: number
}

/** Input to save operations. No path/scope-derived fields. */
export interface TemplateDraft {
  id?: string | undefined
  name: string
  description: string
  content: string
  category?: TemplateCategory | undefined
}

// ── Approval lifecycle (v6.1.0) ─────────────────────────────────────
// Orthogonal to SessionStatus.
export type ApprovalState = 'idle' | 'review' | 'kept' | 'discarded'

export interface Role {
  id: string
  name: string
  icon: string
  persona: string
  outputFormat?: string | undefined
  builtin: boolean
}

export type SessionStatus = 'starting' | 'running' | 'error' | 'exited'

export type BranchMode = 'existing' | 'new' | 'worktree'

export interface SessionLaunchConfig {
  agentOverride?: AgentType | undefined
  agentFlagsOverride?: string | undefined
  /** Text to pipe into the agent's stdin once the PTY is ready. */
  initialPrompt?: string | undefined
  /** Whether to check out an existing branch, create a new one, or use a worktree. */
  branchMode?: BranchMode | undefined
  /** Branch name for the mode above. */
  initialBranch?: string | undefined
  /** Soft cap in USD — displayed in the metrics strip, not enforced in v6.0.0. */
  costCap?: number | undefined
  /** Run mode — stored as intent; runtime enforcement is a follow-up. */
  runMode?: 'watch' | 'auto' | 'plan-first' | undefined
  /** Permission gates — stored as intent; runtime enforcement is a follow-up. */
  approve?: { reads?: boolean; writes?: boolean; commands?: boolean; commits?: boolean } | undefined
  /** Raw model id captured from active-model detector at spawn. Immutable. */
  model?: string | undefined
  /** Resolved context window captured at spawn. Immutable. */
  resolvedContextWindow?: number | undefined
  /** Source of resolvedContextWindow at spawn for the SessionHero badge. Immutable. */
  resolvedContextSource?: ContextSource | undefined
}

export interface Session extends SessionLaunchConfig {
  id: string
  projectId: string
  status: SessionStatus
  startedAt: number
  /** Orthogonal review lifecycle. 'idle' means no pending changes. */
  approvalState: ApprovalState
  /** Template that seeded this session's initial prompt, if any. */
  seedTemplateId: string | null
}

/**
 * Input shape for opening a new session. Carries everything needed to launch
 * the PTY plus the seed template that produced `initialPrompt` (or `null` when
 * no template was used). Required-nullable — callers always know the value.
 */
export interface OpenSessionSeed extends SessionLaunchConfig {
  projectId: string
  seedTemplateId: string | null
}

export type ViewType =
  | 'home'
  | 'session'
  | 'wizard'
  | 'settings'
  | 'template-editor'
  | 'workflow'
  // Redesign (Option B) tab views
  | 'sessions'
  | 'projects'
  | 'project-detail'
  | 'agents'
  | 'workflows'
  | 'history'
  | 'alerts'
  | 'app-settings'
  | 'new-session'
  | 'diff'

export type PaneLayout = 1 | 2 | 3

export interface ActivityEvent {
  id: string
  type: 'read' | 'write' | 'command' | 'tool' | 'think' | 'error'
  title: string
  detail: string
  status: 'done' | 'active' | 'pending'
  timestamp: number
}

export type RightPanelTab = 'files' | 'diff' | 'prompts' | 'env' | 'config'

export interface DetectedStack {
  badge: StackBadge
  items: { label: string; detail: string }[]
  suggestedAgent: AgentType
  suggestedCommands: string[]
  contextFiles: string[]
}

/* ── Workflow Types ─────────────────────────────── */

export type WorkflowNodeType = 'agent' | 'shell' | 'checkpoint' | 'condition'

export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  name: string
  x: number
  y: number

  // agent nodes
  agent?: AgentType | undefined
  agentFlags?: string | undefined
  prompt?: string | undefined
  roleId?: string | undefined

  // shell nodes
  command?: string | undefined

  // checkpoint nodes
  message?: string | undefined

  // shell nodes: configurable timeout (ms), defaults to 60000
  // agent nodes: optional absolute timeout (ms). If unset, only idle timeout applies
  timeout?: number | undefined

  // If true, workflow continues executing when this node fails
  continueOnError?: boolean | undefined

  // Condition node fields
  conditionMode?: 'exitCode' | 'outputMatch' | undefined
  conditionPattern?: string | undefined
  // Retry fields (agent + shell only)
  retryCount?: number | undefined
  retryDelayMs?: number | undefined
  // Codex skill ID (scope:name format, e.g. "global:lint-fix")
  skillId?: string | undefined
}

export interface WorkflowEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  branch?: 'true' | 'false' | undefined
  edgeType?: 'normal' | 'loop' | undefined
  maxIterations?: number | undefined
}

export interface Workflow {
  id: string
  name: string
  description?: string | undefined
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  variables?: WorkflowVariable[] | undefined
  projectId?: string | undefined
  createdAt: number
  updatedAt: number
}

export interface WorkflowMeta {
  id: string
  name: string
  description?: string | undefined
  nodeCount: number
  updatedAt: number
}

export type WorkflowNodeStatus = 'idle' | 'running' | 'done' | 'error' | 'paused' | 'skipped'
export type WorkflowStatus = 'idle' | 'running' | 'done' | 'error' | 'stopped'

export type WorkflowEventType =
  | 'workflow:started'
  | 'workflow:stopped'
  | 'workflow:done'
  | 'workflow:error'
  | 'node:started'
  | 'node:output'
  | 'node:done'
  | 'node:error'
  | 'node:paused'
  | 'node:resumed'
  | 'node:retry'
  | 'node:skipped'
  | 'node:loopIteration'

export interface WorkflowEvent {
  id: string
  type: WorkflowEventType
  workflowId: string
  nodeId?: string | undefined
  message: string
  timestamp: number
  attempt?: number | undefined
  maxAttempts?: number | undefined
  iteration?: number | undefined
  maxIterations?: number | undefined
  branch?: 'true' | 'false' | undefined
}

export interface WorkflowVariable {
  name: string
  label?: string | undefined
  type: 'string' | 'text' | 'path' | 'choice'
  default?: string | undefined
  required?: boolean | undefined
  choices?: string[] | undefined
}

/** Source of a resolved context-window value, used for UI badges. */
export type ContextSource =
  | 'override-model'
  | 'cli-context-override'
  | 'registry-exact'
  | 'heuristic'
  | 'registry-pattern'
  | 'override-agent'
  | 'default'

export interface WorkflowRun {
  id: string
  workflowId: string
  workflowName: string
  status: WorkflowStatus
  startedAt: number
  finishedAt: number | null
  durationMs: number | null
  projectPath: string | null
  variables: Record<string, string>
  nodes: WorkflowNodeRun[]
}

export interface WorkflowNodeRun {
  nodeId: string
  nodeName: string
  status: WorkflowNodeStatus
  startedAt: number | null
  finishedAt: number | null
  durationMs: number | null
  errorTail?: string[] | undefined
  branchTaken?: 'true' | 'false' | undefined
  loopIterations?: number | undefined
  retryAttempts?: number | undefined
}

export interface WorkflowExport {
  formatVersion: 1
  workflow: Workflow
  roles: Role[]
}

export interface ValidationResult {
  errors: string[]
  warnings: string[]
}

/* ── Skill Discovery Types ────────────────────────── */

/** Lightweight skill reference — frontmatter only, no file contents */
export interface SkillInfo {
  /** Stable identifier: `${scope}:${name}` (e.g. "global:lint-fix") */
  id: string
  name: string
  description: string
  path: string
  scope: 'global' | 'project'
}

/** Scan outcome — distinguishes "no skills found" from "scan failed" */
export type ScanStatus = 'ok' | 'partial' | 'failed'

/** Auto-discovered project metadata — refreshed on demand, never user-edited */
export interface ProjectMeta {
  contextFiles: string[]
  skills: SkillInfo[]
  scanStatus: ScanStatus
  scanError?: string | undefined
  skippedSkills?: number | undefined
  lastScanned: number
}

/** Git repository status for a project directory */
export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  staged: number
  unstaged: number
  untracked: number
  insertions: number
  deletions: number
}

/** A set of agent-produced changes awaiting human review */
export interface ReviewItem {
  id: string
  sessionId: string
  agentId: string
  projectId: string
  timestamp: number
  files: ReviewFile[]
  totalInsertions: number
  totalDeletions: number
  status: 'pending' | 'reviewed' | 'dismissed'
}

export interface ReviewFile {
  path: string
  insertions: number
  deletions: number
  status: 'added' | 'modified' | 'deleted'
}

/** Per-session token usage totals, reported by log adapters and cached in the store. */
export interface TokenUsage {
  /** Non-cached input tokens (excludes cache reads). */
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalCostUsd: number
}

/** Aggregated cost data for a single day */
export interface DailyCostEntry {
  date: string // YYYY-MM-DD
  totalCostUsd: number
  perAgent: Record<string, number>
  sessionCount: number
  tokenCount: number
}

/** A proactive suggestion shown on the home screen */
export interface Suggestion {
  id: string
  priority: number
  icon: string
  text: string
  actionLabel: string
  dismissKey: string
}
