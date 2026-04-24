import type { AgentType } from '../../shared/types'
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

export const DETECTORS: Record<AgentType, ActiveModelReader> = {
  'claude-code': readClaudeCodeActiveModel,
  codex: readCodexActiveModel,
  aider: readAiderActiveModel,
  goose: readGooseActiveModel,
  'gemini-cli': readGeminiActiveModel,
  opencode: readOpenCodeActiveModel,
  'amazon-q': readAmazonQActiveModel,
}
