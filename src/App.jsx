import { useState } from 'react'
import MapView from './MapView.jsx'
import Result from './Result.jsx'
import Scanner from './Scanner.jsx'
import ShareLocation from './ShareLocation.jsx'
import usePipeline from './usePipeline.js'
import './App.css'

/** urlscan only accepts real http(s) URLs; QR codes can hold any text. */
function isHttpUrl(text) {
  try {
    const { protocol } = new URL(text)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

const PROGRESS = {
  cached: 'Checking whether we have seen this link before…',
  scanning: 'Opening the page in a sandbox and taking a screenshot…',
  analysing: 'Analysing website…',
}

function App() {
  const [stage, setStage] = useState('scan')
  const [url, setUrl] = useState(null)
  const [cameraError, setCameraError] = useState(null)
  const [typed, setTyped] = useState('')
  const [focusPin, setFocusPin] = useState(null)
  const [photo, setPhoto] = useState(null)
  const pipeline = usePipeline()

  // photo is only present when the camera was used — the paste fallback has
  // nothing to photograph.
  const handleDecoded = (text, capturedPhoto = null) => {
    setUrl(text)
    setPhoto(capturedPhoto)
    setStage('check')
    if (isHttpUrl(text)) pipeline.run(text)
  }

  const scanAgain = () => {
    pipeline.reset()
    setUrl(null)
    setTyped('')
    setCameraError(null)
    setFocusPin(null)
    setPhoto(null)
    setStage('scan')
  }

  const showMap = (pin = null) => {
    setFocusPin(pin)
    setStage('map')
  }

  // Fallback for when the camera is unavailable — and a safety net on stage.
  const submitTyped = (event) => {
    event.preventDefault()
    const text = typed.trim()
    if (text) handleDecoded(text)
  }

  const notAUrl = stage === 'check' && !isHttpUrl(url)
  const progress = PROGRESS[pipeline.status]

  return (
    <main className="app">
      <header className="header">
        <h1>QR Check</h1>
        <p>Scan a sticker before you trust it.</p>
      </header>

      {stage === 'scan' && (
        <>
          <section className="card">
            {cameraError ? (
              <div className="error">
                <p>{cameraError}</p>
              </div>
            ) : (
              <>
                <Scanner onDecoded={handleDecoded} onError={setCameraError} />
                <p className="hint">Point the camera at a QR code.</p>
              </>
            )}
          </section>

          <form className="card manual" onSubmit={submitTyped}>
            <h2 className="label">Or paste a link</h2>
            <input
              type="text"
              inputMode="url"
              placeholder="https://..."
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <button type="submit" disabled={!typed.trim()}>
              Check this link
            </button>
          </form>

          <section className="card">
            <h2 className="label">Just curious?</h2>
            <p className="copy">
              See the QR codes other people have flagged around you.
            </p>
            <button type="button" className="button--ghost" onClick={() => showMap()}>
              Show the map
            </button>
          </section>
        </>
      )}

      {stage === 'map' && (
        <MapView focusPin={focusPin} onBack={() => setStage(url ? 'check' : 'scan')} />
      )}

      {stage === 'check' && (
        <>
          <section className="card">
            <h2 className="label">Decoded link</h2>
            <p className="url">{url}</p>
          </section>

          {notAUrl && (
            <section className="card">
              <p className="verdict verdict--warn">
                This QR code isn&apos;t a web link, so there&apos;s no page to check.
              </p>
              <button type="button" onClick={scanAgain}>
                Scan another
              </button>
            </section>
          )}

          {progress && (
            <section className="card">
              <p className="hint">{progress}</p>
              <div className="bar">
                <div className="bar__fill" />
              </div>
            </section>
          )}

          {pipeline.status === 'error' && (
            <section className="card">
              <div className="error">
                <p>{pipeline.error}</p>
              </div>
              <button type="button" onClick={scanAgain}>
                Scan another
              </button>
            </section>
          )}

          {pipeline.status === 'done' && (
            <>
              <Result
                scan={pipeline.scan}
                analysis={pipeline.analysis}
                decodedUrl={url}
                photo={photo}
                fromCache={pipeline.fromCache}
                onScanAgain={scanAgain}
              />
              <ShareLocation
                scan={pipeline.scan}
                analysis={pipeline.analysis}
                photo={photo}
                onShared={(pin) => showMap(pin)}
              />
            </>
          )}
        </>
      )}
    </main>
  )
}

export default App
