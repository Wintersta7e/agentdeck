import { useMemo } from 'react'
import './KbdHint.css'

interface KbdHintProps {
  /** Shortcut string like `"Ctrl+N"`, `"Ctrl+Shift+F"`, or `"Ctrl+1 / 2 / 3"`. */
  keys: string
  /** Visual size — `sm` matches palette rows, `md` matches the shortcuts dialog. */
  size?: 'sm' | 'md'
}

/**
 * Splits a shortcut string into individual key pills.
 * `+` becomes a thin separator between keys; `/` is preserved as an "or" token
 * so multi-binding hints like "Ctrl+1 / 2 / 3" still read naturally.
 */
export function KbdHint({ keys, size = 'sm' }: KbdHintProps): React.JSX.Element {
  const tokens = useMemo(() => tokenize(keys), [keys])
  return (
    <kbd className={`kbd-hint kbd-hint-${size}`}>
      {tokens.map((tok, i) => {
        if (tok.kind === 'sep') {
          return (
            <span key={i} className="kbd-hint-sep" aria-hidden="true">
              {tok.value}
            </span>
          )
        }
        return (
          <span key={i} className="kbd-hint-key">
            {tok.value}
          </span>
        )
      })}
    </kbd>
  )
}

type Token = { kind: 'key' | 'sep'; value: string }

function tokenize(input: string): Token[] {
  const result: Token[] = []
  // Split on `+` while preserving `/` and whitespace inside chunks so values
  // like `Ctrl+1 / 2 / 3` and `Ctrl + Shift + F` both tokenize sensibly.
  const parts = input.split('+').map((p) => p.trim())
  parts.forEach((part, idx) => {
    if (!part) return
    if (idx > 0) result.push({ kind: 'sep', value: '+' })
    // Handle "1 / 2 / 3" style alternates inside a single segment.
    const alts = part.split(/\s*\/\s*/)
    alts.forEach((alt, j) => {
      if (!alt) return
      if (j > 0) result.push({ kind: 'sep', value: '/' })
      result.push({ kind: 'key', value: alt })
    })
  })
  return result
}
