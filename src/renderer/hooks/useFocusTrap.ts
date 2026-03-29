import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * Trap keyboard focus within a container element while it's mounted.
 * Pressing Tab/Shift+Tab wraps focus within the container.
 * Automatically focuses the first focusable element on mount
 * and restores focus to the previously focused element on unmount.
 */
export function useFocusTrap<T extends HTMLElement>(): React.RefObject<T | null> {
  const containerRef = useRef<T | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Save the element that was focused before the trap opened
    previousFocusRef.current = document.activeElement as HTMLElement | null

    // Focus the first focusable element inside the container
    const focusableElements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    const first = focusableElements[0]
    first?.focus()

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Tab' || !container) return

      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) return

      const firstEl = focusable[0]
      const lastEl = focusable[focusable.length - 1]
      if (!firstEl || !lastEl) return

      if (e.shiftKey) {
        // Shift+Tab: wrap from first → last
        if (document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        }
      } else {
        // Tab: wrap from last → first
        if (document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Restore focus to previous element
      previousFocusRef.current?.focus()
    }
  }, [])

  return containerRef
}
