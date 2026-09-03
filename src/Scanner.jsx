import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

const REGION_ID = 'qr-reader'

/**
 * Camera QR scanner. Calls onDecoded(text) once, with the first code it reads.
 * The parent is expected to unmount us after that (state machine moves on).
 */
const MAX_PHOTO_WIDTH = 720

/**
 * Grabs the whole camera frame — not just the QR code — so the result can show
 * the sticker in context: which meter, which door, what it was stuck over.
 * Must run before the scanner stops, or the video is already torn down.
 */
function capturePhoto() {
  const video = document.querySelector(`#${REGION_ID} video`)
  if (!video?.videoWidth) return null
  try {
    const scale = Math.min(1, MAX_PHOTO_WIDTH / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.7)
  } catch {
    // A failed photo must never block the scan itself.
    return null
  }
}

function Scanner({ onDecoded, onError }) {
  // Keep the callbacks in refs so re-renders never restart the camera.
  const onDecodedRef = useRef(onDecoded)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onDecodedRef.current = onDecoded
    onErrorRef.current = onError
  })

  useEffect(() => {
    const scanner = new Html5Qrcode(REGION_ID)
    let cancelled = false // cleanup has run
    let running = false // camera actually started
    let handled = false // a code was already decoded

    // html5-qrcode *throws* (not rejects) if it isn't running, so guard on both.
    const stop = () => {
      if (!running) return
      running = false
      try {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {})
      } catch {
        // Already stopped — nothing to clean up.
      }
    }

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (handled || cancelled) return
          handled = true
          const photo = capturePhoto() // before stop() kills the video
          stop()
          onDecodedRef.current(decodedText, photo)
        },
        // Per-frame "no code in this frame" noise — ignore it.
        () => {},
      )
      .then(() => {
        running = true
        // StrictMode (and a fast unmount) can tear us down mid-start.
        if (cancelled) stop()
      })
      .catch((err) => {
        if (cancelled) return
        onErrorRef.current?.(
          err?.message ?? 'Could not start the camera. Allow camera access?',
        )
      })

    return () => {
      cancelled = true
      stop()
    }
  }, [])

  return <div id={REGION_ID} className="scanner" />
}

export default Scanner
