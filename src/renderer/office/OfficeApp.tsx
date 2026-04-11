import React from 'react'
import { useOfficeSnapshot } from './hooks/useOfficeSnapshot'
import { useOfficeStore } from './store/officeStore'
import { OfficeSidebar } from './OfficeSidebar'
import { OfficeCanvas } from './OfficeCanvas'

export function OfficeApp(): React.JSX.Element {
  useOfficeSnapshot()
  const snapshot = useOfficeStore((s) => s.snapshot)
  const theme = useOfficeStore((s) => s.theme)

  return (
    <div id="office-root" data-theme={theme ?? 'amber'}>
      <OfficeSidebar workers={snapshot?.workers ?? []} />
      <div className="office-canvas-area">
        <OfficeCanvas snapshot={snapshot} />
      </div>
    </div>
  )
}
