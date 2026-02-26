import type React from 'react'
import type { EnvVar } from '../../../shared/types'
import './EnvVarRow.css'

interface EnvVarRowProps {
  envVar: EnvVar
  onChange: (updated: EnvVar) => void
}

export function EnvVarRow({ envVar, onChange }: EnvVarRowProps): React.JSX.Element {
  return (
    <div className="env-var-row">
      <input
        type="text"
        className="env-key-input"
        value={envVar.key}
        placeholder="KEY"
        onChange={(e) => onChange({ ...envVar, key: e.target.value })}
      />
      <span className="env-eq">=</span>
      <input
        type={envVar.secret ? 'password' : 'text'}
        className="env-val-input"
        value={envVar.value}
        placeholder="value"
        onChange={(e) => onChange({ ...envVar, value: e.target.value })}
      />
      <button
        type="button"
        className="secret-toggle"
        onClick={() => onChange({ ...envVar, secret: !envVar.secret })}
        aria-label={envVar.secret ? 'Mark as not secret' : 'Mark as secret'}
      >
        {envVar.secret ? '\u{1F512}' : '\u{1F513}'}
      </button>
    </div>
  )
}
