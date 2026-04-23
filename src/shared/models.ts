import { normalizeModelId } from './model-id-normalize'

export type ModelProvider = 'anthropic' | 'openai' | 'google' | 'deepseek' | 'meta' | 'other'

export interface ModelEntry {
  id: string
  displayName: string
  provider: ModelProvider
  contextWindow: number
  deprecated?: boolean
}

export const MODELS: ModelEntry[] = [
  // Anthropic — Claude 4.x
  { id: 'claude-opus-4-7', displayName: 'Opus 4.7', provider: 'anthropic', contextWindow: 200_000 },
  {
    id: 'claude-opus-4-7[1m]',
    displayName: 'Opus 4.7 (1M)',
    provider: 'anthropic',
    contextWindow: 1_000_000,
  },
  { id: 'claude-opus-4-6', displayName: 'Opus 4.6', provider: 'anthropic', contextWindow: 200_000 },
  {
    id: 'claude-sonnet-4-6',
    displayName: 'Sonnet 4.6',
    provider: 'anthropic',
    contextWindow: 200_000,
  },
  {
    id: 'claude-sonnet-4-6[1m]',
    displayName: 'Sonnet 4.6 (1M)',
    provider: 'anthropic',
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-sonnet-4-5',
    displayName: 'Sonnet 4.5',
    provider: 'anthropic',
    contextWindow: 200_000,
  },
  {
    id: 'claude-haiku-4-5',
    displayName: 'Haiku 4.5',
    provider: 'anthropic',
    contextWindow: 200_000,
  },
  // OpenAI — GPT-5.x
  { id: 'gpt-5.4', displayName: 'GPT-5.4', provider: 'openai', contextWindow: 1_050_000 },
  { id: 'gpt-5.4-mini', displayName: 'GPT-5.4 Mini', provider: 'openai', contextWindow: 400_000 },
  { id: 'gpt-5.4-nano', displayName: 'GPT-5.4 Nano', provider: 'openai', contextWindow: 400_000 },
  { id: 'gpt-5.3-codex', displayName: 'GPT-5.3 Codex', provider: 'openai', contextWindow: 400_000 },
  { id: 'gpt-5.2-codex', displayName: 'GPT-5.2 Codex', provider: 'openai', contextWindow: 400_000 },
  { id: 'gpt-5.3', displayName: 'GPT-5.3', provider: 'openai', contextWindow: 400_000 },
  { id: 'gpt-5', displayName: 'GPT-5', provider: 'openai', contextWindow: 400_000 },
  // OpenAI — o-series
  { id: 'o1', displayName: 'o1', provider: 'openai', contextWindow: 200_000 },
  { id: 'o3', displayName: 'o3', provider: 'openai', contextWindow: 200_000 },
  // Google — Gemini
  {
    id: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    provider: 'google',
    contextWindow: 2_000_000,
  },
  {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    provider: 'google',
    contextWindow: 1_000_000,
  },
  {
    id: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    provider: 'google',
    contextWindow: 2_000_000,
  },
  {
    id: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    provider: 'google',
    contextWindow: 1_000_000,
  },
  // DeepSeek
  {
    id: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    provider: 'deepseek',
    contextWindow: 64_000,
  },
  {
    id: 'deepseek-coder',
    displayName: 'DeepSeek Coder',
    provider: 'deepseek',
    contextWindow: 64_000,
  },
]

const EXACT_INDEX = new Map<string, ModelEntry>(MODELS.map((m) => [m.id.toLowerCase(), m]))

// Pattern rules — order matters (narrow before broad). First match wins.
const PATTERN_RULES: Array<{ re: RegExp; contextWindow: number; label: string }> = [
  { re: /^claude-opus-4-.*\[1m\]$/, contextWindow: 1_000_000, label: 'claude-opus-4-*[1m]' },
  { re: /^claude-sonnet-4-.*\[1m\]$/, contextWindow: 1_000_000, label: 'claude-sonnet-4-*[1m]' },
  { re: /^claude-haiku-4-.*\[1m\]$/, contextWindow: 1_000_000, label: 'claude-haiku-4-*[1m]' },
  { re: /^claude-.*-4-.*/, contextWindow: 200_000, label: 'claude-*-4-*' },
  { re: /^gpt-5\.4-mini.*/, contextWindow: 400_000, label: 'gpt-5.4-mini*' },
  { re: /^gpt-5\.4-nano.*/, contextWindow: 400_000, label: 'gpt-5.4-nano*' },
  { re: /^gpt-5\.4-pro.*/, contextWindow: 1_050_000, label: 'gpt-5.4-pro*' },
  { re: /^gpt-5\.3-codex.*/, contextWindow: 400_000, label: 'gpt-5.3-codex*' },
  { re: /^gpt-5\.2-codex.*/, contextWindow: 400_000, label: 'gpt-5.2-codex*' },
  { re: /^gpt-5\.3.*/, contextWindow: 400_000, label: 'gpt-5.3*' },
  { re: /^gpt-5.*/, contextWindow: 400_000, label: 'gpt-5*' },
  { re: /^gpt-4o.*/, contextWindow: 128_000, label: 'gpt-4o*' },
  { re: /^gpt-4-turbo.*/, contextWindow: 128_000, label: 'gpt-4-turbo*' },
  { re: /^o1.*/, contextWindow: 200_000, label: 'o1*' },
  { re: /^o3.*/, contextWindow: 200_000, label: 'o3*' },
  { re: /^gemini-2\.5-pro.*/, contextWindow: 2_000_000, label: 'gemini-2.5-pro*' },
  { re: /^gemini-2\.5-flash.*/, contextWindow: 1_000_000, label: 'gemini-2.5-flash*' },
  { re: /^gemini-1\.5-pro.*/, contextWindow: 2_000_000, label: 'gemini-1.5-pro*' },
  { re: /^gemini-1\.5-flash.*/, contextWindow: 1_000_000, label: 'gemini-1.5-flash*' },
  { re: /^deepseek-.*/, contextWindow: 64_000, label: 'deepseek-*' },
]

/**
 * Look up a model by raw id. Normalizes (strips provider prefix, lowercases)
 * before lookup. Tries exact match first, then pattern rules in declared order.
 * Pattern hits return a synthesized entry where `id` = normalized input and
 * `displayName` = the same normalized input (distinguishes synthesized rows
 * from real registry rows, which have distinct human display names).
 * Returns undefined when neither exact nor pattern matches.
 */
export function findModelById(raw: string): ModelEntry | undefined {
  const id = normalizeModelId(raw)
  const exact = EXACT_INDEX.get(id)
  if (exact) return exact
  for (const rule of PATTERN_RULES) {
    if (rule.re.test(id)) {
      return { id, displayName: id, provider: 'other', contextWindow: rule.contextWindow }
    }
  }
  return undefined
}

/** Convenience wrapper: returns the context window for a model id, or undefined. */
export function contextForModel(id: string | null | undefined): number | undefined {
  if (!id) return undefined
  return findModelById(id)?.contextWindow
}
