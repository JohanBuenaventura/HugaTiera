import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export default function TransientSuccess({ message, style, onDismiss }) {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!message) return undefined
    const fadeTimer = window.setTimeout(() => setFading(true), 4700)
    const dismissTimer = window.setTimeout(() => {
      setVisible(false)
      onDismissRef.current?.()
    }, 5000)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(dismissTimer)
    }
  }, [message])

  if (!message || !visible) return null

  return (
    <div className={`form-success transient-success${fading ? ' is-fading' : ''}`} role="status" aria-live="polite" style={style}>
      <span>{message}</span>
      <button
        className="transient-success-dismiss"
        type="button"
        aria-label="Dismiss success message"
        onClick={() => {
          setVisible(false)
          onDismissRef.current?.()
        }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
