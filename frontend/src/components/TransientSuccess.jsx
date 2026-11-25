import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

export default function TransientSuccess({ message, style }) {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setFading(true), 4700)
    const dismissTimer = window.setTimeout(() => setVisible(false), 5000)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(dismissTimer)
    }
  }, [])

  if (!message || !visible) return null

  return (
    <div className={`form-success transient-success${fading ? ' is-fading' : ''}`} role="status" aria-live="polite" style={style}>
      <span>{message}</span>
      <button
        className="transient-success-dismiss"
        type="button"
        aria-label="Dismiss success message"
        onClick={() => setVisible(false)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
