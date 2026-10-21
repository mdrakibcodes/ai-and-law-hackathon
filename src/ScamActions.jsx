import { useState } from 'react'
import ShareLocation from './ShareLocation.jsx'

export default function ScamActions({ scan, analysis, photo, onShared }) {
  const [suspected, setSuspected] = useState(false)
  const flagged = ['suspicious', 'dangerous'].includes(analysis.verdict)
  if (analysis.verdict === 'safe') return null
  if (!flagged && !suspected) {
    return (
      <section className="card">
        <p>If you suspect this link is a scam, you can report it and share its location.</p>
        <button type="button" className="button--warn" onClick={() => setSuspected(true)}>
          I suspect a scam — report or pin it
        </button>
      </section>
    )
  }
  return (
    <>
      <section className="card">
        <h2 className="label">Report to Scamwatch</h2>
        {!flagged && <p>This is your suspicion. The scanner has not verified this website as unsafe.</p>}
        <p>Help Scamwatch identify scams by reporting the website and what happened.</p>
        <p className="url">{scan.scannedUrl}</p>
        <a className="link" href="https://www.scamwatch.gov.au/report-a-scam" target="_blank" rel="noopener noreferrer">
          Report to Scamwatch
        </a>
        <p className="hint">Complete the report on Scamwatch. This app does not submit a report for you or share your location with Scamwatch.</p>
      </section>
      <ShareLocation scan={scan} analysis={analysis} photo={photo} userReported={!flagged} onShared={onShared} />
    </>
  )
}
