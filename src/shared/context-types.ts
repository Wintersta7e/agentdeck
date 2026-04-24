import type { ContextSource } from './types'

export interface ContextResult {
  value: number
  source: ContextSource
  modelId: string | null
  unknownModelHint?: string
}

export type SetContextOverrideArgs =
  | { kind: 'agent'; agentId: string; value: number | undefined }
  | { kind: 'model'; modelId: string; value: number | undefined }
