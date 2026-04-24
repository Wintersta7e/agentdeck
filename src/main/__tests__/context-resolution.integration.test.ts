// src/main/__tests__/context-resolution.integration.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AgentType } from '../../shared/types'

vi.mock('../active-model-detectors', () => {
  const readers: Record<
    string,
    () => Promise<{ modelId: string | null; cliContextOverride?: number }>
  > = {}
  return {
    DETECTORS: new Proxy({} as Record<string, unknown>, {
      get: (_t, prop: string) => readers[prop] ?? (() => Promise.resolve({ modelId: null })),
    }),
    __setReader: (
      id: string,
      fn: () => Promise<{ modelId: string | null; cliContextOverride?: number }>,
    ) => {
      readers[id] = fn
    },
  }
})

import * as detectorsMod from '../active-model-detectors'
import { resolveActiveModel, __resetCacheForTests } from '../active-model-cache'
import { getEffectiveContextWindow } from '../../shared/context-window'
import { AGENTS } from '../../shared/agents'

const setReader = (
  detectorsMod as unknown as {
    __setReader: (
      id: string,
      fn: () => Promise<{ modelId: string | null; cliContextOverride?: number }>,
    ) => void
  }
).__setReader

// AGENTS is an array in this repo — build a lookup by id.
const AGENTS_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<
  string,
  (typeof AGENTS)[number]
>

const ROWS: Array<{
  agentId: AgentType
  detector: { modelId: string | null; cliContextOverride?: number | undefined }
  expected: { value: number; source: string }
}> = [
  {
    agentId: 'claude-code',
    detector: { modelId: 'claude-opus-4-7[1m]' },
    expected: { value: 1_000_000, source: 'registry-exact' },
  },
  {
    agentId: 'codex',
    detector: { modelId: 'gpt-5.4', cliContextOverride: 2_000_000 },
    expected: { value: 2_000_000, source: 'cli-context-override' },
  },
  {
    agentId: 'aider',
    detector: { modelId: 'claude-opus-4-7' },
    expected: { value: 200_000, source: 'registry-exact' },
  },
  {
    agentId: 'goose',
    detector: { modelId: null },
    expected: { value: AGENTS_BY_ID.goose!.contextWindow, source: 'default' },
  },
  {
    agentId: 'gemini-cli',
    detector: { modelId: 'gemini-2.5-pro' },
    expected: { value: 2_000_000, source: 'registry-exact' },
  },
  {
    agentId: 'opencode',
    detector: { modelId: 'anthropic/claude-sonnet-4-5' },
    expected: { value: 200_000, source: 'registry-exact' },
  },
  {
    agentId: 'amazon-q',
    detector: { modelId: null },
    expected: { value: AGENTS_BY_ID['amazon-q']!.contextWindow, source: 'default' },
  },
]

describe('end-to-end context resolution per agent', () => {
  beforeEach(() => __resetCacheForTests())

  for (const row of ROWS) {
    it(`resolves ${row.agentId}`, async () => {
      setReader(
        row.agentId,
        async () => row.detector as import('../active-model-detectors').DetectorOutput,
      )
      const det = await resolveActiveModel(row.agentId)
      const r = getEffectiveContextWindow({
        agentId: row.agentId,
        activeModel: det.modelId,
        ...(det.cliContextOverride !== undefined
          ? { cliContextOverride: det.cliContextOverride }
          : {}),
        overrides: { agent: {}, model: {} },
        agentDefaults: Object.fromEntries(AGENTS.map((a) => [a.id, a.contextWindow])),
      })
      expect(r.value).toBe(row.expected.value)
      expect(r.source).toBe(row.expected.source)
    })
  }
})
