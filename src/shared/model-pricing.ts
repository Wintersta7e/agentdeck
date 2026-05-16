/**
 * Per-model USD pricing for cost estimation.
 *
 * Pricing lives in `model-pricing.json` so it can be updated without code
 * changes. To refresh: bump `lastUpdated`, edit the rates, run `npm test`
 * (the parsing tests in this folder will catch shape regressions).
 */

import pricingData from './model-pricing.json'

export interface ModelRate {
  inputPer1M: number
  outputPer1M: number
}

interface PricingFile {
  lastUpdated: string
  currency: string
  perTokens: number
  claude: Record<string, ModelRate>
  codex: Record<string, ModelRate>
}

const data = pricingData as PricingFile

// Hoisted once: getClaudePricing fires on every Claude JSONL turn parsed
// during pty tailing — avoid rebuilding the entries array per call.
const CLAUDE_TIERS: ReadonlyArray<readonly [string, ModelRate]> = Object.entries(data.claude)

export const PRICING_METADATA = {
  lastUpdated: data.lastUpdated,
  currency: data.currency,
  perTokens: data.perTokens,
} as const

/**
 * Match a Claude model ID (e.g. `claude-opus-4-7`) to its tier pricing.
 * Tier match is substring-based since Claude rolls minor versions on the
 * same per-tier rate.
 */
export function getClaudePricing(model: string): ModelRate | undefined {
  for (const [tier, rate] of CLAUDE_TIERS) {
    if (model.includes(tier)) return rate
  }
  return undefined
}

/**
 * Look up a Codex model by exact ID. Codex IDs are explicit (gpt-4o,
 * gpt-5.4, etc.) so we require an exact key match.
 */
export function getCodexPricing(model: string): ModelRate | undefined {
  return data.codex[model]
}
