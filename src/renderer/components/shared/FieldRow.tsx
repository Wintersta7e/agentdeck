import './FieldRow.css'

interface FieldRowProps {
  label: string
  sublabel?: string | undefined
  children: React.ReactNode
}

export function FieldRow({ label, sublabel, children }: FieldRowProps): React.JSX.Element {
  return (
    <div className="field-row">
      <div className="field-row-left">
        <div className="form-label">{label}</div>
        {sublabel && <div className="form-sublabel">{sublabel}</div>}
      </div>
      <div className="field-row-right">{children}</div>
    </div>
  )
}
