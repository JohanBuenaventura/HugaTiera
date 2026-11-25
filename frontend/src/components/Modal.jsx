import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

export default function Modal({
  open,
  onClose,
  title,
  eyebrow = '',
  children,
  closeDisabled = false,
  className = '',
}) {
  const dialogRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) {
        dialog.showModal()
      }
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined

    const handleCancel = (event) => {
      if (closeDisabled) {
        event.preventDefault()
        return
      }
      event.preventDefault()
      onClose?.()
    }

    const handleClose = () => {
      if (open && !closeDisabled) {
        onClose?.()
      }
    }

    const handleBackdropClick = (event) => {
      if (closeDisabled || 'closedBy' in HTMLDialogElement.prototype) return
      if (event.target !== dialog) return
      const rect = dialog.getBoundingClientRect()
      const isInside = (
        rect.top <= event.clientY
        && event.clientY <= rect.top + rect.height
        && rect.left <= event.clientX
        && event.clientX <= rect.left + rect.width
      )
      if (!isInside) {
        onClose?.()
      }
    }

    dialog.addEventListener('cancel', handleCancel)
    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('click', handleBackdropClick)
    return () => {
      dialog.removeEventListener('cancel', handleCancel)
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('click', handleBackdropClick)
    }
  }, [closeDisabled, onClose, open])

  return (
    <dialog
      ref={dialogRef}
      className={`app-dialog no-print${className ? ` ${className}` : ''}`}
      closedby={closeDisabled ? 'none' : 'any'}
      aria-labelledby={titleId}
    >
      <div className="app-dialog-surface">
        <div className="app-dialog-header">
          <div>
            {eyebrow && <p className="eyebrow app-dialog-eyebrow">{eyebrow}</p>}
            <h2 id={titleId} className="app-dialog-title">{title}</h2>
          </div>
          <button
            type="button"
            className="app-dialog-close"
            aria-label="Close dialog"
            disabled={closeDisabled}
            onClick={() => { if (!closeDisabled) onClose?.() }}
          >
            <X size={18} />
          </button>
        </div>
        <div className="app-dialog-body">
          {children}
        </div>
      </div>
    </dialog>
  )
}
