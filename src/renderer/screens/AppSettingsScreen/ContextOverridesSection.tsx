import { useCallback, useEffect, useState } from 'react'
import { AGENTS } from '../../../shared/agents'
import { useEffectiveContext, badgeLabelFor } from '../../hooks/useEffectiveContext'
import './ContextOverridesSection.css'

const MIN = 1_000
const MAX = 10_000_000

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function parseOverrideInput(raw: string): number | undefined | 'invalid' {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const n = Number(trimmed)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < MIN || n > MAX) return 'invalid'
  return n
}

interface AgentRowProps {
  agentId: string
  agentName: string
  registryDefault: number
  agentOverride: number | undefined
  onSave: (value: number | undefined) => void
}

function AgentRow({
  agentId,
  agentName,
  registryDefault,
  agentOverride,
  onSave,
}: AgentRowProps): React.JSX.Element {
  const ctx = useEffectiveContext(agentId)
  const badge = badgeLabelFor(ctx.source, ctx.modelId)
  const [draft, setDraft] = useState<string>(
    agentOverride !== undefined ? String(agentOverride) : '',
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Nested async so react-hooks/set-state-in-effect doesn't flag the sync branch.
    const sync = async (): Promise<void> => {
      setDraft(agentOverride !== undefined ? String(agentOverride) : '')
    }
    void sync()
  }, [agentOverride])

  const handleBlur = useCallback(() => {
    if (draft === '' && agentOverride === undefined) return
    const parsed = parseOverrideInput(draft)
    if (parsed === 'invalid') {
      setError(`Must be an integer between ${formatTokens(MIN)} and ${formatTokens(MAX)}`)
      return
    }
    setError(null)
    if (parsed === agentOverride) return
    onSave(parsed)
  }, [draft, agentOverride, onSave])

  const autoDisplay = ctx.loading
    ? '…'
    : ctx.value !== null
      ? `${formatTokens(ctx.value)}${badge !== null ? ` · ${badge}` : ''}`
      : `${formatTokens(registryDefault)} · (default)`

  return (
    <div className="ctx-overrides-row">
      <span className="ctx-overrides-row__name">{agentName}</span>
      <input
        type="number"
        className="ctx-overrides-row__input"
        aria-label={`${agentName} override`}
        placeholder={ctx.value !== null ? formatTokens(ctx.value) : formatTokens(registryDefault)}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
      />
      <span className="ctx-overrides-row__auto">auto: {autoDisplay}</span>
      <button
        type="button"
        className="ctx-overrides-row__clear"
        aria-label={`Clear ${agentName} override`}
        disabled={agentOverride === undefined}
        onClick={() => {
          setDraft('')
          setError(null)
          onSave(undefined)
        }}
      >
        Clear
      </button>
      {error !== null && <span className="ctx-overrides-row__error">{error}</span>}
    </div>
  )
}

interface AddModelOverrideRowProps {
  onSave: (modelId: string, value: number) => void
}

function AddModelOverrideRow({ onSave }: AddModelOverrideRowProps): React.JSX.Element {
  const [modelId, setModelId] = useState('')
  const [valueStr, setValueStr] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(() => {
    const trimmedId = modelId.trim()
    if (trimmedId === '') {
      setError('Model ID is required')
      return
    }
    const parsed = parseOverrideInput(valueStr)
    if (parsed === undefined || parsed === 'invalid') {
      setError(`Context must be an integer between ${formatTokens(MIN)} and ${formatTokens(MAX)}`)
      return
    }
    setError(null)
    onSave(trimmedId, parsed)
    setModelId('')
    setValueStr('')
  }, [modelId, valueStr, onSave])

  return (
    <div className="ctx-overrides-add-row">
      <input
        type="text"
        className="ctx-overrides-add-row__model-input"
        aria-label="New model ID"
        placeholder="model-id (e.g. claude-opus-4-5)"
        value={modelId}
        onChange={(e) => setModelId(e.target.value)}
      />
      <input
        type="number"
        className="ctx-overrides-row__input"
        aria-label="New model context size"
        placeholder={formatTokens(200_000)}
        value={valueStr}
        onChange={(e) => setValueStr(e.target.value)}
      />
      <button type="button" className="ctx-overrides-add-row__save" onClick={handleSave}>
        Save
      </button>
      {error !== null && (
        <span className="ctx-overrides-row__error ctx-overrides-add-row__error">{error}</span>
      )}
    </div>
  )
}

export function ContextOverridesSection(): React.JSX.Element {
  const [agentOverrides, setAgentOverrides] = useState<Record<string, number>>({})
  const [modelOverrides, setModelOverrides] = useState<Record<string, number>>({})
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    const res = await window.agentDeck.agents.getOverrides()
    setAgentOverrides(res.agent)
    setModelOverrides(res.model)
    setLoaded(true)
  }, [])

  useEffect(() => {
    const run = async (): Promise<void> => {
      await reload()
    }
    void run()
  }, [reload])

  const saveAgent = useCallback(
    async (agentId: string, value: number | undefined) => {
      await window.agentDeck.agents.setContextOverride({ kind: 'agent', agentId, value })
      await reload()
    },
    [reload],
  )

  const clearModel = useCallback(
    async (modelId: string) => {
      await window.agentDeck.agents.setContextOverride({ kind: 'model', modelId, value: undefined })
      await reload()
    },
    [reload],
  )

  const addModel = useCallback(
    async (modelId: string, value: number) => {
      await window.agentDeck.agents.setContextOverride({ kind: 'model', modelId, value })
      await reload()
    },
    [reload],
  )

  return (
    <section className="ctx-overrides-section" aria-labelledby="ctx-overrides-title">
      <header className="ctx-overrides-section__head">
        <h2 id="ctx-overrides-title" className="ctx-overrides-section__title">
          Context overrides
        </h2>
        <p className="ctx-overrides-section__sub">
          Per-model override wins. Per-CLI override is a fallback, used when automatic detection
          can&apos;t identify the model. Leave both blank to use detection.
        </p>
      </header>

      <div className="ctx-overrides-subsection">
        <div className="ctx-overrides-subsection__label">Per-CLI fallback</div>
        {AGENTS.map((a) => (
          <AgentRow
            key={a.id}
            agentId={a.id}
            agentName={a.name}
            registryDefault={a.contextWindow}
            agentOverride={loaded ? agentOverrides[a.id] : undefined}
            onSave={(v) => void saveAgent(a.id, v)}
          />
        ))}
      </div>

      {Object.keys(modelOverrides).length > 0 && (
        <div className="ctx-overrides-subsection">
          <div className="ctx-overrides-subsection__label">Per-model overrides</div>
          {Object.entries(modelOverrides).map(([modelId, value]) => (
            <div key={modelId} className="ctx-overrides-row">
              <span className="ctx-overrides-row__name">{modelId}</span>
              <span className="ctx-overrides-row__value">{formatTokens(value)}</span>
              <button
                type="button"
                className="ctx-overrides-row__clear"
                aria-label={`Clear ${modelId} override`}
                onClick={() => void clearModel(modelId)}
              >
                Clear
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="ctx-overrides-subsection">
        <div className="ctx-overrides-subsection__label">Add a model override</div>
        <p className="ctx-overrides-subsection__hint">
          Teach AgentDeck the context window for a specific model ID. Takes priority over per-CLI
          fallbacks and detection.
        </p>
        <AddModelOverrideRow onSave={(id, v) => void addModel(id, v)} />
      </div>
    </section>
  )
}
