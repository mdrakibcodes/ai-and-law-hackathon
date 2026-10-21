import Screenshot from './Screenshot.jsx'

const VERDICT_COPY = {
  dangerous: { tone: 'bad', title: '⚠ Unsafe — do not open this website' },
  suspicious: { tone: 'warn', title: '⚠ Potentially unsafe — website blocked' },
  unverified: { tone: 'warn', title: 'Unable to verify — no safety verdict' },
  safe: { tone: 'ok', title: 'Safe verdict — opening website…' },
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
        {analysis.page_type === 'feedback_survey' && <><dt>Page type</dt><dd>Feedback / survey form</dd></>}
      </dl>

      {analysis.verdict === 'unverified' && (
        <p className="copy">There was not enough evidence to assess this page. It has not been opened. The reasons below explain what could not be checked.</p>
      )}

      {analysis.verdict !== 'unverified' && <div className="meters">
        <Meter label="Impersonation" value={analysis.impersonation_probability} />
        <Meter label="Phishing" value={analysis.phishing_probability} />
      </div>}

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
