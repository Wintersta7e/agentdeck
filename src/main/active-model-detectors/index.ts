import type { BuiltinAgentId } from '../../shared/agents'
import type { DetectorOutput } from './claude-code'
import { readClaudeCodeActiveModel } from './claude-code'
import { readCodexActiveModel } from './codex'
import { readAiderActiveModel } from './aider'
import { readGooseActiveModel } from './goose'
import { readGeminiActiveModel } from './gemini'
import { readOpenCodeActiveModel } from './opencode'
import { readAmazonQActiveModel } from './amazon-q'

export type ActiveModelReader = () => Promise<DetectorOutput>
export type { DetectorOutput }

// `satisfies` (not an annotation) keeps the literal key set so every BuiltinAgentId
// must have a detector (exhaustiveness), while NOT degrading to an index signature
// the way `Record<AgentType, …>` would once AgentType widened to accept custom ids.
export const DETECTORS = {
  'claude-code': readClaudeCodeActiveModel,
  codex: readCodexActiveModel,
  aider: readAiderActiveModel,
  goose: readGooseActiveModel,
  'gemini-cli': readGeminiActiveModel,
  opencode: readOpenCodeActiveModel,
  'amazon-q': readAmazonQActiveModel,
} satisfies Record<BuiltinAgentId, ActiveModelReader>
