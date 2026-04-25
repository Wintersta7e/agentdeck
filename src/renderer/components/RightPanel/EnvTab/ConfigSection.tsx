import { useCallback, useState, useRef, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'
import type { ConfigEntry } from '../../../../shared/types'

interface Props {
  config: ConfigEntry[]
}

/**
 * Flat key/value list of resolved config entries. The server already truncates
 * values at 200 chars; we still render with ellipsis-overflow so a long line
 * doesn't break the layout. Each row has a copy button that writes the raw
 * value via `navigator.clipboard`. Empty state: "No config entries."
 */
export function ConfigSection({ config }: Props): React.JSX.Element {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const onCopy = useCallback((key: string, value: string): void => {
    void (async (): Promise<void> => {
      try {
        await navigator.clipboard.writeText(value)
        setCopiedKey(key)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => setCopiedKey(null), 1200)
      } catch {
        // Clipboard API unavailable — silently no-op; UI shows no confirmation.
      }
    })()
  }, [])

  return (
    <section className="env-tab__section">
      <h3 className="env-tab__section-title">Config</h3>
      {config.length === 0 ? (
        <div className="env-tab__empty-hint">No config entries.</div>
      ) : (
        <ul className="env-tab__config">
          {config.map((entry, i) => {
            const id = `${entry.scope}-${entry.key}-${i}`
            const isCopied = copiedKey === id
            return (
              <li key={id} className="env-tab__config-row">
                <span className="env-tab__config-key" title={entry.key}>
                  {entry.key}
                </span>
                <span className={`env-tab__scope-badge env-tab__scope-badge--${entry.scope}`}>
                  {entry.scope}
                </span>
                <code className="env-tab__config-value" title={entry.value}>
                  {entry.value}
                </code>
                <button
                  type="button"
                  className="env-tab__config-copy"
                  aria-label={isCopied ? `Copied ${entry.key}` : `Copy ${entry.key}`}
                  onClick={() => onCopy(id, entry.value)}
                  title={isCopied ? 'Copied' : 'Copy value'}
                >
                  {isCopied ? (
                    <Check size={12} aria-hidden="true" />
                  ) : (
                    <Copy size={12} aria-hidden="true" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
