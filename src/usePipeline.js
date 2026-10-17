import { useCallback, useEffect, useRef, useState } from 'react'
import { instagramProfileLink } from './instagram.js'

// Scans use server-owned evidence. Official Instagram profile links follow the
// explicit direct-open preference, with no fabricated account or safety verdict.
export function usePipeline() {
  const [directProfile, setDirectProfile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [scan, setScan] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [fromCache, setFromCache] = useState(false)
  const [error, setError] = useState(null)

  // Bumped on every run()/reset() so in-flight work knows it is stale.
  const runIdRef = useRef(0)
  useEffect(() => () => { runIdRef.current += 1 }, [])

  const reset = useCallback(() => {
    runIdRef.current += 1
    setDirectProfile(null)
    setStatus('idle')
    setScan(null)
    setAnalysis(null)
    setFromCache(false)
    setError(null)
  }, [])

  const run = useCallback(async (url) => {
    const runId = (runIdRef.current += 1)
    const alive = () => runIdRef.current === runId

    setDirectProfile(null)
    setStatus('cached')
    setScan(null)
    setAnalysis(null)
    setFromCache(false)
    setError(null)

    const profile = instagramProfileLink(url)
    if (profile) {
      setDirectProfile(profile)
      setStatus('instagram')
      return
    }

    try {
      setStatus('scanning')
      const response = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const result = await response.json().catch(() => null)
      if (!alive()) return
      if (!response.ok || !result?.scan || !result?.analysis) {
        throw new Error(result?.message || 'The scanner is unavailable at this address. Please use the QR Check Render app and try again.')
      }
      setScan(result.scan)
      setAnalysis(result.analysis)
      setFromCache(Boolean(result.fromCache))
      setStatus('done')
    } catch (err) {
      if (!alive()) return
      setError(err.message)
      setStatus('error')
    }
  }, [])

  return { status, scan, analysis, directProfile, fromCache, error, run, reset }
}

export default usePipeline
