import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getViewLocation, readPins } from './pins.js'

// Leaflet's default marker icons rely on asset paths that break under a
// bundler, so use circle markers — which also lets us colour by verdict.
const COLOURS = {
  dangerous: '#ff6b6b',
  suspicious: '#ffb020',
  safe: '#3fc380',
}

// Worst verdict wins when several scans share one spot — a safe scan must
// never mask a dangerous one sitting underneath it.
const SEVERITY = { safe: 0, suspicious: 1, dangerous: 2 }

const EARTH_RADIUS_M = 6371000

/** Great-circle distance in metres. */
function distanceM(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

// Pins are stored at ~110m precision, so two scans of the same sticker can land
// in adjacent cells purely because they straddled a rounding boundary. Cluster
// by distance rather than exact coordinates, or one sticker shows as two dots.
const CLUSTER_RADIUS_M = 150

/**
 * Groups pins into locations, then collapses repeats of the same URL within
 * each location so one marker represents one place and lists what is there.
 */
function groupByLocation(pins) {
  const groups = []

  for (const pin of pins) {
    let group = groups.find((g) => distanceM(g, pin) <= CLUSTER_RADIUS_M)
    if (!group) {
      group = { key: pin.id ?? `${pin.lat},${pin.lng}`, lat: pin.lat, lng: pin.lng, members: [], byUrl: new Map() }
      groups.push(group)
    }
    group.members.push(pin)

    // Keep the marker at the centre of everything gathered so far.
    group.lat = group.members.reduce((sum, m) => sum + m.lat, 0) / group.members.length
    group.lng = group.members.reduce((sum, m) => sum + m.lng, 0) / group.members.length

    const seen = group.byUrl.get(pin.url)
    if (seen) {
      seen.count = (seen.count ?? 1) + (pin.count ?? 1)
      seen.photo = seen.photo ?? pin.photo
    } else {
      group.byUrl.set(pin.url, { ...pin, count: pin.count ?? 1 })
    }
  }

  return groups.map(({ key, lat, lng, byUrl }) => {
    const scans = [...byUrl.values()]
    return {
      key,
      lat,
      lng,
      scans,
      verdict: scans.reduce(
        (worst, s) => (SEVERITY[s.verdict] > SEVERITY[worst] ? s.verdict : worst),
        'safe',
      ),
    }
  })
}

const radiusFor = (group, selected) =>
  (selected ? 12 : 9) + Math.min(6, group.scans.length - 1) * 1.5

function MapView({ onBack, focusPin }) {
  const containerRef = useRef(null)
  const markersRef = useRef(new Map())
  const mapRef = useRef(null)
  const meRef = useRef(null)
  const [pins, setPins] = useState(null)
  const [selected, setSelected] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState(null)

  useEffect(() => {
    let alive = true
    readPins().then((data) => {
      if (alive) setPins(data)
    })
    return () => {
      alive = false
    }
  }, [])

  const groups = pins ? groupByLocation(pins) : []

  useEffect(() => {
    if (!pins || !containerRef.current) return

    // Nothing pinned yet — show Australia rather than the null island. This
    // also gives the map a valid view before anything tries to change it.
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([-25.6, 134.4], 4)
    mapRef.current = map
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    const located = groupByLocation(pins)
    markersRef.current = new Map()

    if (located.length) {
      for (const group of located) {
        const colour = COLOURS[group.verdict] ?? COLOURS.suspicious
        const marker = L.circleMarker([group.lat, group.lng], {
          radius: radiusFor(group, false),
          color: colour,
          fillColor: colour,
          fillOpacity: 0.65,
          weight: 2,
        }).addTo(map)

        // Details render in a panel under the map rather than a Leaflet popup:
        // a popup gets clipped by the short map container and auto-pans the
        // view, so closing it left the pins off-screen.
        marker.on('click', () => setSelected(group.key))
        markersRef.current.set(group.key, { marker, group })
      }

      // Leaflet measures the container on creation, which in React happens
      // before the browser has laid the card out — so a fit computed now uses
      // a zero size and lands on world zoom. Re-measure on the next frame.
      const applyView = () => {
        map.invalidateSize()
        if (focusPin) {
          map.setView([focusPin.lat, focusPin.lng], 16)
        } else if (located.length === 1) {
          map.setView([located[0].lat, located[0].lng], 15)
        } else {
          map.fitBounds(L.latLngBounds(located.map((g) => [g.lat, g.lng])).pad(0.25))
        }
      }
      applyView()
      const raf = requestAnimationFrame(applyView)

      // Leaflet caches the container size, so a rotated phone or any layout
      // change leaves the map rendering into stale dimensions (blank strip
      // down one side). Re-measure whenever the container actually resizes.
      const observer = new ResizeObserver(() => map.invalidateSize())
      observer.observe(containerRef.current)

      return () => {
        cancelAnimationFrame(raf)
        observer.disconnect()
        markersRef.current = new Map()
        meRef.current = null
        mapRef.current = null
        map.remove()
      }
    }

    return () => {
      markersRef.current = new Map()
      meRef.current = null
      mapRef.current = null
      map.remove()
    }
  }, [pins, focusPin])

  // Centre the map on the viewer. The position is used for the view only —
  // it is never written to a pin or sent anywhere.
  const locateMe = async () => {
    setLocating(true)
    setLocateError(null)
    try {
      const { lat, lng } = await getViewLocation()
      const map = mapRef.current
      if (!map) return
      if (meRef.current) meRef.current.remove()
      meRef.current = L.circleMarker([lat, lng], {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#3b6cf6',
        fillOpacity: 1,
      })
        .addTo(map)
        .bindTooltip('You are here')
      map.setView([lat, lng], 16)
    } catch (err) {
      setLocateError(err.message)
    } finally {
      setLocating(false)
    }
  }

  // Highlight the chosen marker without touching the map view.
  useEffect(() => {
    for (const [key, { marker, group }] of markersRef.current) {
      const isSelected = key === selected
      marker.setStyle({ weight: isSelected ? 4 : 2, fillOpacity: isSelected ? 0.9 : 0.65 })
      marker.setRadius(radiusFor(group, isSelected))
    }
  }, [selected, pins])

  const total = pins?.length ?? 0
  // A selection pointing at a group that no longer exists resolves to null,
  // so no cleanup effect is needed.
  const chosen = groups.find((g) => g.key === selected) ?? null

  return (
    <section className="card">
      <div className="map__head">
        <h2 className="label">Scanned nearby</h2>
        <button type="button" className="button--ghost button--small" onClick={onBack}>
          Back
        </button>
      </div>

      {pins === null && <p className="hint">Loading the map…</p>}
      {total === 0 && pins !== null && (
        <p className="hint">
          Nothing pinned yet. Check a QR code and choose to share its location to
          put the first one on the map.
        </p>
      )}

      <div ref={containerRef} className="map" />

      <div className="map__controls">
        <button
          type="button"
          className="button--ghost button--small"
          onClick={locateMe}
          disabled={locating || pins === null}
        >
          {locating ? 'Finding you…' : 'Locate me'}
        </button>
        <span className="hint">Used to centre the map. Not saved.</span>
      </div>

      {locateError && <p className="verdict verdict--warn">{locateError}</p>}

      {total > 0 && (
        <ul className="legend">
          {Object.entries(COLOURS).map(([verdict, colour]) => (
            <li key={verdict}>
              <span className="legend__dot" style={{ background: colour }} />
              {verdict}
            </li>
          ))}
        </ul>
      )}

      {chosen ? (
        <LocationDetails group={chosen} onClose={() => setSelected(null)} />
      ) : (
        total > 0 && (
          <p className="hint">
            {total} {total === 1 ? 'scan' : 'scans'} across {groups.length}{' '}
            {groups.length === 1 ? 'location' : 'locations'}. Tap a dot to see what
            was found there.
          </p>
        )
      )}
    </section>
  )
}

function LocationDetails({ group, onClose }) {
  const photo = group.scans.find((s) => s.photo)?.photo

  return (
    <div className="details-panel">
      <div className="map__head">
        <h3 className="label">
          {group.scans.length === 1
            ? '1 code scanned here'
            : `${group.scans.length} codes scanned here`}
        </h3>
        <button type="button" className="button--ghost button--small" onClick={onClose}>
          Close
        </button>
      </div>

      {photo && (
        <figure className="shot-figure">
          <img className="shot" src={photo} alt="The QR code at this location" />
          <figcaption className="hint">Photographed when it was scanned.</figcaption>
        </figure>
      )}

      <ul className="scan-list">
        {group.scans.map((scan) => (
          <li key={scan.url ?? scan.id}>
            <span
              className="legend__dot"
              style={{ background: COLOURS[scan.verdict] ?? COLOURS.suspicious }}
            />
            <div>
              <strong>{scan.brand || 'Unknown page'}</strong>
              <p className="url url--small">{scan.domain}</p>
              <p className="hint">
                {scan.verdict} · {Number(scan.phishing_probability) || 0}% phishing
                {(scan.count ?? 1) > 1 && ` · seen ${scan.count}×`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default MapView
