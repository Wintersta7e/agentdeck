import { useCallback, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import './CollapsibleSection.css'

interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean | undefined
  storageKey: string
  action?: React.ReactNode | undefined
  children: React.ReactNode
}

function getStored(key: string, defaultValue: boolean): boolean {
  try {
    const val = localStorage.getItem(`collapse:${key}`)
    return val === null ? defaultValue : val === 'true'
  } catch {
    return defaultValue
  }
}

function setStored(key: string, open: boolean): void {
  try {
    localStorage.setItem(`collapse:${key}`, String(open))
  } catch {
    // localStorage unavailable
  }
}

export function CollapsibleSection({
  title,
  defaultOpen = true,
  storageKey,
  action,
  children,
}: CollapsibleSectionProps): React.JSX.Element {
  const [open, setOpen] = useState(() => getStored(storageKey, defaultOpen))

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      setStored(storageKey, next)
      return next
    })
  }, [storageKey])

  return (
    <div className="collapsible-section">
      <div className="collapsible-header">
        <button className="collapsible-toggle" onClick={toggle} aria-expanded={open} type="button">
          <ChevronRight size={12} className={`collapsible-chevron${open ? ' open' : ''}`} />
          <span className="collapsible-title">{title}</span>
        </button>
        {action && <div className="collapsible-action">{action}</div>}
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  )
}
