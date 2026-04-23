import { findModelById } from './models'
import { inferContextFromModelId } from './model-heuristic'
import type { ContextResult } from './context-types'

export interface ContextResolverInput {
  agentId: string
  activeModel: string | null
  cliContextOverride?: number | undefined
  overrides: {
    agent: Record<string, number>
    model: Record<string, number>
  }
  agentDefaults: Record<string, number>
}

/**
 * Resolve the effective context-window for a given agent + optional active model.
 * Pure function — no IO. Precedence (first hit wins):
 *   1. overrides.model[rawModelId]     [override-model]
 *   2. cliContextOverride              [cli-context-override]
 *   3. MODELS registry exact match     [registry-exact]
 *   4. inferContextFromModelId         [heuristic]
 *   5. MODELS registry pattern match   [registry-pattern]
 *   6. overrides.agent[agentId]        [override-agent]
 *   7. agentDefaults[agentId]          [default]
 */
export function getEffectiveContextWindow(input: ContextResolverInput): ContextResult {
  const { agentId, activeModel, cliContextOverride, overrides, agentDefaults } = input

  // 1. Per-model override (raw id key)
  if (activeModel !== null) {
    const modelOverride = overrides.model[activeModel]
    if (modelOverride !== undefined) {
      return {
        value: modelOverride,
        source: 'override-model',
        modelId: activeModel,
      }
    }
  }

  // 2. CLI-native explicit context
  if (cliContextOverride !== undefined) {
    return {
      value: cliContextOverride,
      source: 'cli-context-override',
      modelId: activeModel,
    }
  }

  // 3 / 4 / 5. Registry + heuristic. Registry exact beats heuristic;
  // heuristic beats registry pattern. Pattern-synthesized MODELS rows
  // have displayName === id (per models.ts contract); real rows have
  // a distinct displayName like 'Opus 4.7'.
  if (activeModel !== null) {
    const hit = findModelById(activeModel)
    if (hit !== undefined) {
      const isExact = hit.displayName !== hit.id
      if (isExact) {
        return { value: hit.contextWindow, source: 'registry-exact', modelId: activeModel }
      }
      const heuristic = inferContextFromModelId(activeModel)
      if (heuristic !== undefined) {
        return { value: heuristic, source: 'heuristic', modelId: activeModel }
      }
      return { value: hit.contextWindow, source: 'registry-pattern', modelId: activeModel }
    }
    // No registry hit at all — try heuristic
    const heuristic = inferContextFromModelId(activeModel)
    if (heuristic !== undefined) {
      return { value: heuristic, source: 'heuristic', modelId: activeModel }
    }
  }

  // 6. Per-agent override (applies when no model detected OR model unknown)
  const agentOverride = overrides.agent[agentId]
  if (agentOverride !== undefined) {
    return {
      value: agentOverride,
      source: 'override-agent',
      modelId: activeModel,
    }
  }

  // 7. Agent default (last resort)
  const defaultVal = agentDefaults[agentId] ?? 0
  const result: ContextResult = {
    value: defaultVal,
    source: 'default',
    modelId: activeModel,
  }
  if (activeModel !== null) result.unknownModelHint = activeModel
  return result
}
