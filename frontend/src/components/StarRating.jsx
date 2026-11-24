import { useState } from 'react'
import { Star } from 'lucide-react'

const STAR_VALUES = [1, 2, 3, 4, 5]

export default function StarRating({ value = 0, onChange, size = 22, label = 'Rating', className = '' }) {
  const [hovered, setHovered] = useState(0)
  const interactive = typeof onChange === 'function'
  const rating = Math.max(0, Math.min(5, Number(value) || 0))
  const shown = interactive && hovered ? hovered : rating
  const fillWidth = `${(shown / STAR_VALUES.length) * 100}%`

  function handleKeyDown(event, star) {
    if (!interactive) return
    let next = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(5, star + 1)
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(1, star - 1)
    if (event.key === 'Home') next = 1
    if (event.key === 'End') next = 5
    if (next === null) return
    event.preventDefault()
    setHovered(next)
    onChange(next)
  }

  return (
    <div
      className={`star-rating${interactive ? ' is-interactive' : ''}${className ? ` ${className}` : ''}`}
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={interactive ? label : `${rating.toFixed(1)} out of 5 stars`}
    >
      <div className="star-rating-track" aria-hidden="true">
        {STAR_VALUES.map((star) => (
          <Star key={star} size={size} fill="currentColor" strokeWidth={1.5} />
        ))}
      </div>
      <div className="star-rating-fill" style={{ width: fillWidth }} aria-hidden="true">
        <div className="star-rating-fill-icons">
          {STAR_VALUES.map((star) => (
            <Star key={star} size={size} fill="currentColor" strokeWidth={1.5} />
          ))}
        </div>
      </div>
      {interactive && (
        <div className="star-rating-input">
          {STAR_VALUES.map((star) => (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={rating === star}
              aria-label={`${star} star${star === 1 ? '' : 's'}`}
              style={{ width: size, height: size }}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onFocus={() => setHovered(star)}
              onBlur={() => setHovered(0)}
              onClick={() => onChange(star)}
              onKeyDown={(event) => handleKeyDown(event, star)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
