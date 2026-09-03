/**
 * Map pins for QR codes people chose to share (see vite-plugin-scan-cache.js).
 * Backed by scan-pins.json in the project root.
 */

/**
 * Deliberately coarse: ~110m of precision is plenty to warn the next person
 * walking up to the same parking meter, and it avoids storing exactly where
 * somebody was standing when they scanned.
 */
const PRECISION = 3

const round = (n) => Number(n.toFixed(PRECISION))

export async function readPins() {
  try {
    const res = await fetch('/api/pins')
    return res.ok ? await res.json() : []
  } catch {
    return []
  }
}

export async function addPin(pin) {
  const res = await fetch('/api/pins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pin),
  })
  if (!res.ok) throw new Error('Could not save the pin')
  return res.json()
}

/**
 * Asks the browser for the device location. Only ever called after the user
 * has agreed in our own UI — the browser prompt should never be the first time
 * somebody learns what we want their location for.
 */
export function getCoarseLocation() {
  return requestLocation(true)
}

/**
 * Unrounded position, used only to centre the map on "Locate me". It is never
 * written to a pin or sent anywhere — it lives as long as the map view does.
 */
export function getViewLocation() {
  return requestLocation(false)
}

function requestLocation(coarse) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This device cannot share a location.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve(
          coarse
            ? { lat: round(coords.latitude), lng: round(coords.longitude) }
            : { lat: coords.latitude, lng: coords.longitude },
        ),
      (err) => {
        const messages = {
          1: 'Location permission was denied.',
          2: 'Your location is unavailable right now.',
          3: 'Getting your location took too long.',
        }
        reject(new Error(messages[err.code] ?? 'Could not get your location.'))
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  })
}
