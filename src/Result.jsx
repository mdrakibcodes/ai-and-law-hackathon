import { useState } from 'react'
import Screenshot from './Screenshot.jsx'

const VERDICT_COPY = {
  dangerous: { tone: 'bad', title: 'Do not enter anything on this page' },
  suspicious: { tone: 'warn', title: 'Treat this page with caution' },
  safe: { tone: 'ok', title: 'No signs of a scam' },
}

/** Host of the URL the QR code actually contained, before any redirects. */
function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

function Result({ scan, analysis, decodedUrl, photo, fromCache, onScanAgain }) {
  const { finalDomain, malicious, score, scannedUrl, screenshotUrl, reportUrl } = scan
  const verdict = VERDICT_COPY[analysis.verdict] ?? VERDICT_COPY.suspicious

  const scannedHost = hostOf(scannedUrl ?? decodedUrl)
  const redirected = Boolean(
    finalDomain && scannedHost && !scannedHost.endsWith(finalDomain),
  )

  return (
    <section className="card">
      <p className={`verdict verdict--${verdict.tone} verdict--headline`}>
        {verdict.title}
      </p>

      {photo && (
        <figure className="shot-figure">
          <img className="shot" src={photo} alt="The QR code you scanned, in context" />
          <figcaption className="hint">The code you scanned, and where it was.</figcaption>
        </figure>
      )}

      <figure className="shot-figure">
        <Screenshot src={screenshotUrl} alt={`Screenshot of ${finalDomain}`} />
        <figcaption className="hint">The page it leads to.</figcaption>
      </figure>

      <dl className="facts">
        <dt>Appears to be</dt>
        <dd>{analysis.suspected_brand}</dd>
        <dt>Actually served by</dt>
        <dd className="url">{finalDomain ?? 'unknown'}</dd>
      </dl>

      <div className="meters">
        <Meter label="Impersonation" value={analysis.impersonation_probability} />
        <Meter label="Phishing" value={analysis.phishing_probability} />
      </div>

      {redirected && (
        <p className="verdict verdict--warn">This link redirected to a different domain.</p>
      )}
      {malicious && (
        <p className="verdict verdict--bad">
          urlscan also flagged this as malicious{score != null && ` (score ${score})`}
        </p>
      )}

      {analysis.requests_sensitive_data && analysis.data_requested.length > 0 && (
        <div>
          <h3 className="label">It asks you for</h3>
          {/* Only alarming when the page isn't who it claims to be — a real
              login page asking for a password is not a red flag. */}
          <ul className={`list ${analysis.verdict === 'safe' ? '' : 'list--danger'}`}>
            {analysis.data_requested.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.reasons.length > 0 && (
        <div>
          <h3 className="label">Why</h3>
          <ul className="list">
            {analysis.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.visual_signals.length > 0 && (
        <details className="details">
          <summary>Visual signals</summary>
          <ul className="list">
            {analysis.visual_signals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </details>
      )}

      <ContinueToSite url={scannedUrl ?? decodedUrl} verdict={analysis.verdict} />

      <ReportScam analysis={analysis} domain={finalDomain} />

      <div className="actions">
        {fromCache && <p className="hint">Loaded from the local cache.</p>}
        {reportUrl && (
          <a className="link" href={reportUrl} target="_blank" rel="noreferrer">
            View full urlscan report
          </a>
        )}
        <button type="button" onClick={onScanAgain}>
          Scan another
        </button>
      </div>
    </section>
  )
}

/**
 * Offers a way through to the site itself. Safe pages get a plain button;
 * suspicious ones require a second, deliberate tap; dangerous ones get no
 * route through at all — if we are 90% sure it is a scam, handing over a
 * one-tap link undoes the point of the app.
 */
function ContinueToSite({ url, verdict }) {
  const [confirming, setConfirming] = useState(false)

  if (verdict === 'dangerous' || !url) return null

  // noreferrer matters here: these pages are hostile by assumption, and we do
  // not want to leak where the visit came from.
  const open = () => window.open(url, '_blank', 'noopener,noreferrer')

  if (verdict === 'safe') {
    return (
      <button type="button" onClick={open}>
        Continue to the website
      </button>
    )
  }

  if (!confirming) {
    return (
      <button type="button" className="button--ghost" onClick={() => setConfirming(true)}>
        Proceed anyway
      </button>
    )
  }

  return (
    <div className="confirm">
      <p className="verdict verdict--warn">
        This page showed warning signs. Do not enter passwords, card details or
        ID documents if you continue.
      </p>
      <div className="actions actions--row">
        <button type="button" className="button--ghost" onClick={() => setConfirming(false)}>
          Go back
        </button>
        <button type="button" className="button--warn" onClick={open}>
          Continue with caution
        </button>
      </div>
    </div>
  )
}

/**
 * Prototype of the reporting flow. It shows what a real submission would send,
 * but nothing leaves the device — the demo note says so plainly, so nobody
 * believes an authority has actually been contacted.
 */
function ReportScam({ analysis, domain }) {
  const [state, setState] = useState('idle') // idle | confirming | sent

  if (analysis.verdict === 'safe') return null

  if (state === 'sent') {
    return (
      <div className="confirm">
        <p className="verdict verdict--ok">Report submitted to Scamwatch.</p>
        <p className="hint demo-note">
          Prototype only — nothing was sent. A working version would lodge this
          with Scamwatch or cyber.gov.au.
        </p>
      </div>
    )
  }

  if (state === 'confirming') {
    return (
      <div className="confirm">
        <h3 className="label">This report would include</h3>
        <ul className="list">
          <li>The web address and the domain that served it ({domain})</li>
          <li>The sandbox screenshot of the page</li>
          <li>Your photo of the QR code, if you took one</li>
          <li>
            The assessment: {analysis.verdict}, {analysis.phishing_probability}%
            phishing
          </li>
          <li>The rounded location, only if you shared it</li>
        </ul>
        <div className="actions actions--row">
          <button type="button" className="button--ghost" onClick={() => setState('idle')}>
            Cancel
          </button>
          <button type="button" onClick={() => setState('sent')}>
            Send report
          </button>
        </div>
      </div>
    )
  }

  return (
    <button type="button" className="button--warn" onClick={() => setState('confirming')}>
      Report this scam
    </button>
  )
}

function Meter({ label, value }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0))
  const tone = pct >= 70 ? 'bad' : pct >= 35 ? 'warn' : 'ok'
  return (
    <div className="meter">
      <div className="meter__head">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="bar">
        <div className={`bar__level bar__level--${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default Result
