import { useEffect, useCallback } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import './ConfirmDialog.css'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string | undefined
  onConfirm: () => void
  onCancel: () => void
  /** Optional third action button (rendered between Cancel and Confirm). */
  extraAction?: { label: string; onClick: () => void } | undefined
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  extraAction,
}: ConfirmDialogProps): React.JSX.Element | null {
  const trapRef = useFocusTrap<HTMLDivElement>()

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onCancel])

  // Click on backdrop closes dialog
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onCancel()
      }
    },
    [onCancel],
  )

  if (!open) return null

  return (
    <div
      className="confirm-dialog-backdrop"
      ref={trapRef}
      onClick={handleBackdropClick}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <div className="confirm-dialog">
        <div className="confirm-dialog-body">
          <h3 id="confirm-dialog-title" className="confirm-dialog-title">
            {title}
          </h3>
          <p id="confirm-dialog-message" className="confirm-dialog-message">
            {message}
          </p>
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          {extraAction && (
            <button
              type="button"
              className="confirm-dialog-btn-extra"
              onClick={extraAction.onClick}
            >
              {extraAction.label}
            </button>
          )}
          <button type="button" className="confirm-dialog-btn-confirm" onClick={onConfirm}>
            {confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
