import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, X } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { AGENTS } from '../../../shared/agents'
import {
  CURATED_COLOR_VARS,
  validateCustomAgent,
  looksLikeCredentialKey,
  BLOCKED_ENV_KEYS,
  type AgentDescriptorWire,
} from '../../../shared/custom-agents'
import './CustomAgentModal.css'

/** Set of built-in agent ids a custom agent may not shadow. */
const BUILTIN_IDS: ReadonlySet<string> = new Set(AGENTS.map((a) => a.id))

/** Lowercase, replace runs of invalid chars with a single dash, trim dashes. */
export function slugifyId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128)
}

interface EnvRow {
  key: string
  value: string
}

export interface CustomAgentModalProps {
  /** Pre-filled agent for edit/clone mode; null for a fresh add. */
  initial: AgentDescriptorWire | null
  /** 'add' | 'edit' | 'clone' — controls id mutability and footer. */
  mode: 'add' | 'edit' | 'clone'
  /**
   * Source agent id to load the full (non-redacted) spec from for edit/clone —
   * args/env/versionArgs aren't on the redacted wire descriptor. For clone the
   * displayed id is blanked, so this carries the original id to fetch from.
   */
  sourceId?: string | undefined
  onClose: () => void
  /** Edit-mode only: open the remove confirmation for this agent. */
  onRequestRemove?: (() => void) | undefined
}

export function CustomAgentModal({
  initial,
  mode,
  sourceId,
  onClose,
  onRequestRemove,
}: CustomAgentModalProps): React.JSX.Element {
  const trapRef = useFocusTrap<HTMLDivElement>()
  const uid = useId()
  const titleId = `${uid}-title`

  // Edit mode keeps the existing id (immutable). Add/clone derive from name.
  const isEdit = mode === 'edit'
  const isAdd = mode === 'add'

  const [name, setName] = useState(initial?.name ?? '')
  // When the user hasn't manually edited the id, it auto-derives from the name
  // (add/clone). `idOverride` holds the manual value once they take control;
  // edit mode is immutable so the id is simply the initial id.
  const [idOverride, setIdOverride] = useState<string | null>(null)
  const idTouched = idOverride !== null
  const id = isEdit ? (initial?.id ?? '') : (idOverride ?? slugifyId(name))
  const [binary, setBinary] = useState(initial?.binary ?? '')
  // args/env/versionArgs are main-only (not on the redacted wire descriptor).
  // In edit/clone mode they're hydrated from the full spec via getCustomSpec
  // (effect below) so a save doesn't wipe them; add mode starts blank.
  // Args are edited one-per-row so an arg may legitimately contain spaces.
  const [argRows, setArgRows] = useState<string[]>([])
  const [icon, setIcon] = useState(initial?.icon ?? '●')
  const [short, setShort] = useState(initial?.short ?? '')
  const [colorVar, setColorVar] = useState<string>(
    initial && (CURATED_COLOR_VARS as readonly string[]).includes(initial.colorVar)
      ? initial.colorVar
      : '--accent',
  )
  const [description, setDescription] = useState(initial?.description ?? '')
  const [contextWindow, setContextWindow] = useState(
    initial?.contextWindow ? String(initial.contextWindow) : '',
  )
  const [versionArgsText, setVersionArgsText] = useState('--version')
  const [envRows, setEnvRows] = useState<EnvRow[]>([])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Drop blank rows; keep each remaining arg verbatim (spaces are significant).
  const parsedArgs = useMemo(() => argRows.filter((a) => a.trim() !== ''), [argRows])
  const parsedVersionArgs = useMemo(() => splitArgs(versionArgsText), [versionArgsText])

  // Build a candidate spec and validate it live with the shared validator.
  const candidate = useMemo(() => {
    const env: Record<string, string> = {}
    for (const row of envRows) {
      if (row.key) env[row.key] = row.value
    }
    const ctx = contextWindow.trim() === '' ? undefined : Number(contextWindow)
    return {
      id,
      binary,
      ...(parsedArgs.length > 0 ? { args: parsedArgs } : {}),
      ...(Object.keys(env).length > 0 ? { env } : {}),
      ui: {
        name,
        icon,
        ...(short ? { short } : {}),
        colorVar,
        ...(description ? { description } : {}),
        ...(ctx !== undefined && Number.isFinite(ctx) ? { contextWindow: ctx } : {}),
        ...(parsedVersionArgs.length > 0 ? { versionArgs: parsedVersionArgs } : {}),
      },
      source: 'user' as const,
    }
  }, [
    id,
    binary,
    parsedArgs,
    envRows,
    name,
    icon,
    short,
    colorVar,
    description,
    contextWindow,
    parsedVersionArgs,
  ])

  const validation = useMemo(() => validateCustomAgent(candidate, BUILTIN_IDS), [candidate])
  const isValid = validation.ok

  // Per-field credential warnings (advisory; validator also blocks them).
  const envWarnings = useMemo(
    () =>
      envRows.map(
        (row) =>
          row.key !== '' && (looksLikeCredentialKey(row.key) || BLOCKED_ENV_KEYS.has(row.key)),
      ),
    [envRows],
  )

  const launchLine = useMemo(() => {
    const bin = binary || '<binary>'
    // Quote args that contain whitespace so the preview reads unambiguously.
    const rest =
      parsedArgs.length > 0
        ? ` ${parsedArgs.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`
        : ''
    return `cd <project> && ${bin}${rest}`
  }, [binary, parsedArgs])

  // Hydrate args/env/versionArgs from the full custom spec in edit/clone mode.
  // The redacted wire descriptor omits them, so a save would otherwise wipe
  // them. `sourceId` is the original agent id (clone blanks the displayed id).
  useEffect(() => {
    if (isAdd) return
    const id = sourceId
    if (!id) return
    let cancelled = false
    void window.agentDeck.agents
      .getCustomSpec(id)
      .then((spec) => {
        if (cancelled || !spec) return
        if (spec.args && spec.args.length > 0) setArgRows(spec.args)
        if (spec.env) {
          const rows = Object.entries(spec.env).map(([key, value]) => ({ key, value }))
          if (rows.length > 0) setEnvRows(rows)
        }
        if (spec.ui.versionArgs && spec.ui.versionArgs.length > 0) {
          setVersionArgsText(spec.ui.versionArgs.join(' '))
        }
      })
      .catch((err: unknown) => {
        void window.agentDeck.log.send('warn', 'agents', 'getCustomSpec failed', {
          id,
          err: String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [isAdd, sourceId])

  // Close on Escape (capture phase, like ConfirmDialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  const updateArgRow = useCallback((index: number, value: string) => {
    setArgRows((rows) => rows.map((r, i) => (i === index ? value : r)))
  }, [])

  const updateEnvRow = useCallback((index: number, patch: Partial<EnvRow>) => {
    setEnvRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }, [])

  const handleSave = useCallback(async () => {
    if (!validation.ok || saving) return
    setSaving(true)
    setServerError(null)
    try {
      const res = await window.agentDeck.agents.saveCustom(validation.value)
      if (res.ok) {
        onClose()
      } else {
        setServerError(res.error)
      }
    } catch (err) {
      setServerError(String(err))
    } finally {
      setSaving(false)
    }
  }, [validation, saving, onClose])

  const heading = isEdit ? 'Edit agent' : mode === 'clone' ? 'Clone agent' : 'Add agent'

  return (
    <div
      className="cam-backdrop"
      ref={trapRef}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="cam-dialog">
        <header className="cam-header">
          <h2 id={titleId} className="cam-title">
            {heading}
          </h2>
          <button type="button" className="cam-close" onClick={onClose} aria-label="Close dialog">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="cam-body">
          {/* ── Live preview chip ── */}
          <div className="cam-preview">
            <span
              className="cam-preview__chip"
              style={{ '--cam-chip-color': `var(${colorVar})` } as React.CSSProperties}
            >
              <span className="cam-preview__icon" aria-hidden="true">
                {icon}
              </span>
              <span className="cam-preview__name">{name || 'Agent name'}</span>
              <span className="cam-preview__short">{short || deriveShort(name)}</span>
            </span>
          </div>

          {/* ── Essentials ── */}
          <fieldset className="cam-section">
            <legend className="cam-section__legend">Essentials</legend>

            <label className="cam-field">
              <span className="cam-field__label">Name</span>
              <input
                className="cam-input"
                type="text"
                value={name}
                maxLength={64}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Agent"
              />
            </label>

            <div className="cam-field">
              <span className="cam-field__label">ID</span>
              {isEdit ? (
                <input className="cam-input" type="text" value={id} readOnly aria-readonly="true" />
              ) : (
                <input
                  className="cam-input cam-input--mono"
                  type="text"
                  value={id}
                  maxLength={128}
                  onChange={(e) => setIdOverride(e.target.value)}
                  aria-describedby={`${uid}-id-hint`}
                  placeholder="my-agent"
                />
              )}
              <span id={`${uid}-id-hint`} className="cam-hint">
                {isEdit
                  ? 'ID is fixed after creation.'
                  : idTouched
                    ? 'Custom ID — lowercase letters, digits, _ and - only.'
                    : 'Auto-derived from the name. Edit to override.'}
              </span>
            </div>

            <label className="cam-field">
              <span className="cam-field__label">Binary</span>
              <input
                className="cam-input cam-input--mono"
                type="text"
                value={binary}
                maxLength={256}
                onChange={(e) => setBinary(e.target.value)}
                placeholder="my-agent-bin"
              />
            </label>

            <div className="cam-field">
              <span className="cam-field__label">Args</span>
              {argRows.map((arg, i) => (
                <div className="cam-arg-row" key={i}>
                  <input
                    className="cam-input cam-input--mono"
                    type="text"
                    value={arg}
                    aria-label={`Argument ${i + 1}`}
                    placeholder="run"
                    onChange={(e) => updateArgRow(i, e.target.value)}
                  />
                  <button
                    type="button"
                    className="cam-arg-remove"
                    aria-label={`Remove argument ${i + 1}`}
                    onClick={() => setArgRows((rows) => rows.filter((_, j) => j !== i))}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="cam-arg-add"
                onClick={() => setArgRows((rows) => [...rows, ''])}
              >
                + Add argument
              </button>
              <span className="cam-hint">
                One argument per row. Spaces are allowed within an argument.
              </span>
            </div>

            <div className="cam-launch">
              <span className="cam-launch__label">Launches</span>
              <code className="cam-launch__cmd">{launchLine}</code>
            </div>
          </fieldset>

          {/* ── Appearance ── */}
          <fieldset className="cam-section">
            <legend className="cam-section__legend">Appearance</legend>

            <div className="cam-row2">
              <label className="cam-field">
                <span className="cam-field__label">Icon</span>
                <input
                  className="cam-input"
                  type="text"
                  value={icon}
                  maxLength={4}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="●"
                />
              </label>
              <label className="cam-field">
                <span className="cam-field__label">Short</span>
                <input
                  className="cam-input"
                  type="text"
                  value={short}
                  maxLength={4}
                  onChange={(e) => setShort(e.target.value.toUpperCase())}
                  placeholder={deriveShort(name)}
                />
              </label>
            </div>

            <div className="cam-field">
              <span className="cam-field__label" id={`${uid}-color`}>
                Colour
              </span>
              <div className="cam-swatches" role="radiogroup" aria-labelledby={`${uid}-color`}>
                {CURATED_COLOR_VARS.map((cv) => (
                  <button
                    key={cv}
                    type="button"
                    role="radio"
                    aria-checked={colorVar === cv}
                    aria-label={`Colour ${cv.replace(/^--/, '')}`}
                    className={`cam-swatch${colorVar === cv ? ' cam-swatch--active' : ''}`}
                    style={{ '--cam-sw': `var(${cv})` } as React.CSSProperties}
                    onClick={() => setColorVar(cv)}
                  />
                ))}
              </div>
            </div>

            <label className="cam-field">
              <span className="cam-field__label">Description</span>
              <input
                className="cam-input"
                type="text"
                value={description}
                maxLength={200}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Local autonomous agent"
              />
            </label>

            <label className="cam-field">
              <span className="cam-field__label">Context window</span>
              <input
                className="cam-input cam-input--mono"
                type="number"
                min={0}
                value={contextWindow}
                onChange={(e) => setContextWindow(e.target.value)}
                placeholder="128000"
              />
            </label>
          </fieldset>

          {/* ── Advanced (collapsed) ── */}
          <div className="cam-section">
            <button
              type="button"
              className="cam-disclosure"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              {advancedOpen ? (
                <ChevronDown size={14} aria-hidden="true" />
              ) : (
                <ChevronRight size={14} aria-hidden="true" />
              )}
              <span>Advanced</span>
            </button>

            {advancedOpen && (
              <div className="cam-advanced">
                <p className="cam-note">
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span>
                    Env vars are stored in plaintext. Do not put secrets here — secure storage
                    arrives in Phase 2.
                  </span>
                </p>

                <div className="cam-field">
                  <span className="cam-field__label">Environment</span>
                  {envRows.map((row, i) => {
                    const warn = envWarnings[i] === true
                    return (
                      <div className="cam-env-row" key={i}>
                        <input
                          className="cam-input cam-input--mono"
                          type="text"
                          value={row.key}
                          aria-label={`Env key ${i + 1}`}
                          placeholder="OLLAMA_HOST"
                          onChange={(e) => updateEnvRow(i, { key: e.target.value })}
                        />
                        <input
                          className="cam-input cam-input--mono"
                          type="text"
                          value={row.value}
                          aria-label={`Env value ${i + 1}`}
                          placeholder="127.0.0.1:11434"
                          onChange={(e) => updateEnvRow(i, { value: e.target.value })}
                        />
                        <button
                          type="button"
                          className="cam-env-remove"
                          aria-label={`Remove env row ${i + 1}`}
                          onClick={() => setEnvRows((rows) => rows.filter((_, j) => j !== i))}
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                        {warn && (
                          <span className="cam-env-warn" role="alert">
                            <AlertTriangle size={12} aria-hidden="true" />
                            This key looks like a credential and is blocked.
                          </span>
                        )}
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    className="cam-env-add"
                    onClick={() => setEnvRows((rows) => [...rows, { key: '', value: '' }])}
                  >
                    + Add variable
                  </button>
                </div>

                <label className="cam-field">
                  <span className="cam-field__label">Version args</span>
                  <input
                    className="cam-input cam-input--mono"
                    type="text"
                    value={versionArgsText}
                    onChange={(e) => setVersionArgsText(e.target.value)}
                    placeholder="--version"
                  />
                </label>
              </div>
            )}
          </div>

          {/* ── Inline validation / server error ── */}
          {!validation.ok && (
            <p className="cam-error" role="alert">
              {validation.error}
            </p>
          )}
          {serverError && (
            <p className="cam-error" role="alert">
              {serverError}
            </p>
          )}
        </div>

        <footer className="cam-footer">
          {isEdit && onRequestRemove && (
            <button type="button" className="cam-btn cam-btn--danger" onClick={onRequestRemove}>
              Remove
            </button>
          )}
          <span className="cam-footer__spacer" />
          <button type="button" className="cam-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="cam-btn cam-btn--primary"
            disabled={!isValid || saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}

/** Split a free-text args string into tokens on whitespace. */
function splitArgs(text: string): string[] {
  return text.trim() === '' ? [] : text.trim().split(/\s+/)
}

function deriveShort(name: string): string {
  const alnum = name.replace(/[^A-Za-z0-9]/g, '')
  return (alnum.slice(0, 2) || 'AG').toUpperCase()
}
