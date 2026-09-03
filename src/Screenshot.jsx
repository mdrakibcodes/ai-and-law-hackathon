import { useState } from 'react'

const MAX_RETRIES = 8
const RETRY_DELAY_MS = 2500

/**
 * urlscan's screenshot can 404 for a few seconds after the result is ready,
 * so retry a handful of times with a cache-busting param before giving up.
 */
function Screenshot({ src, alt }) {
  const [retry, setRetry] = useState({ src, attempt: 0, failed: false })

  // A new scan means a new URL — start the retry budget over. Adjusting state
  // during render is cheaper than an effect (no wasted commit).
  if (retry.src !== src) {
    setRetry({ src, attempt: 0, failed: false })
  }

  if (!src) return null

  if (retry.failed) {
    return (
      <div className="shot shot--empty">
        <p>No screenshot available for this scan.</p>
      </div>
    )
  }

  const { attempt } = retry

  return (
    <img
      // Key forces a real reload rather than reusing the cached 404.
      key={attempt}
      className="shot"
      src={attempt === 0 ? src : `${src}?retry=${attempt}`}
      alt={alt}
      onError={() => {
        setTimeout(() => {
          setRetry((prev) =>
            prev.src !== src
              ? prev
              : prev.attempt < MAX_RETRIES
                ? { ...prev, attempt: prev.attempt + 1 }
                : { ...prev, failed: true },
          )
        }, RETRY_DELAY_MS)
      }}
    />
  )
}

export default Screenshot
