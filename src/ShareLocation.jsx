import { useState } from 'react'
import { addPin, getCoarseLocation } from './pins.js'

/**
 * Asks for consent in our own words before triggering the browser's location
 * prompt. People accept a permission far more readily when they already know
 * what it buys them — and the browser dialog cannot explain that.
 */
function ShareLocation({ scan, analysis, photo, userReported = false, onShared }) {
  const [state, setState] = useState('offer') // offer | sharing | shared | declined | error
  const [error, setError] = useState(null)

  const risky = analysis.verdict !== 'safe'

  const share = async () => {
    setState('sharing')
    setError(null)
    try {
      const { lat, lng } = await getCoarseLocation()
      const pin = await addPin({
        lat,
        lng,
        url: scan.scannedUrl,
        domain: scan.finalDomain,
        brand: analysis.suspected_brand,
        verdict: userReported ? 'suspicious' : analysis.verdict,
        phishing_probability: userReported ? null : analysis.phishing_probability,
        report_source: userReported ? 'user' : 'scan',
        assessment_verdict: analysis.verdict,
        photo,
      })
      setState('shared')
      onShared?.(pin)
    } catch (err) {
      setError(`${err.message} This scan was not added to the map.`)
      setState('error')
    }
  }

  if (state === 'shared') {
    return (
      <section className="card">
        <p className="verdict verdict--ok">
          Added to the map. The next person who scans this sticker will be warned.
        </p>
      </section>
    )
  }

  if (state === 'declined') {
    return (
      <section className="card">
        <p className="hint">Not added to the map. Nothing was shared.</p>
      </section>
    )
  }

  return (
    <section className="card">
      <h2 className="label">
        {userReported ? 'Pin a suspected scam location' : risky ? 'Pin the scam location' : 'Add this to the map'}
      </h2>
      {userReported && <p className="hint">This pin will be labelled as a user-reported suspicion, not an AI-confirmed scam.</p>}
      <p className="copy">
        {risky
          ? 'Other apps protect the person scanning. Pinning this on the map protects everyone who walks up to this sticker after you.'
          : 'You can pin this scan on the map so others can see it has been checked.'}
      </p>
      <p className="copy copy--muted">
        Only share if you are at the place where you found the suspicious QR code.
        This pins your current location. We round it to about 110 metres, store no identifying details,
        and only use it for this pin.
        {photo ? ' Your photo of the code is shared with the pin.' : ''}
      </p>

      {state === 'error' && <p className="verdict verdict--warn">{error}</p>}

      <div className="actions actions--row">
        <button type="button" className="button--ghost" onClick={() => setState('declined')}>
          No thanks
        </button>
        <button type="button" onClick={share} disabled={state === 'sharing'}>
          {state === 'sharing' ? 'Getting location…' : 'Pin this location'}
        </button>
      </div>
    </section>
  )
}

export default ShareLocation
