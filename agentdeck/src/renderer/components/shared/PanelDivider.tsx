import { useCallback, useRef, useState } from 'react'
import './PanelDivider.css'

interface PanelDividerProps {
  /** Which side of the divider the resizable panel is on */
  side: 'left' | 'right'
  /** Ref to the panel element being resized */
  panelRef: React.RefObject<HTMLDivElement | null>
  minWidth: number
  maxWidth: number
  /** Called with the final width when drag ends */
  onResizeEnd: (width: number) => void
}

export function PanelDivider({
  side,
  panelRef,
  minWidth,
  maxWidth,
  onResizeEnd,
}: PanelDividerProps): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const panel = panelRef.current
      if (!panel) return

      startXRef.current = e.clientX
      startWidthRef.current = panel.offsetWidth
      setDragging(true)

      const handleMouseMove = (ev: MouseEvent): void => {
        const delta = ev.clientX - startXRef.current
        // If panel is on the left, dragging right = wider; if on right, dragging left = wider
        const newWidth =
          side === 'left' ? startWidthRef.current + delta : startWidthRef.current - delta
        const clamped = Math.max(minWidth, Math.min(maxWidth, newWidth))
        panel.style.width = `${clamped}px`
      }

      const handleMouseUp = (): void => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        setDragging(false)

        if (panel) {
          onResizeEnd(panel.offsetWidth)
        }
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [side, panelRef, minWidth, maxWidth, onResizeEnd],
  )

  return (
    <div className={`panel-divider${dragging ? ' dragging' : ''}`} onMouseDown={handleMouseDown} />
  )
}
