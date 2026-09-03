import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeScreenshot } from './analyze.js'
import { readCache, writeCache } from './cache.js'
import { submitAndPoll } from './urlscan.js'

/**
 * Drives the whole check: cache -> urlscan sandbox -> Claude vision.
 *
 * A cache hit returns the previous verdict instantly, so a URL we have already
 * scanned always shows the same result — which keeps the demo working when
 * urlscan is slow, rate-limited, or the venue wifi drops.
 *
 * status: 'idle' | 'cached' | 'scanning' | 'analysing' | 'done' | 'error'
 */
export function usePipeline() {
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
    setStatus('idle')
    setScan(null)
    setAnalysis(null)
    setFromCache(false)
    setError(null)
  }, [])

  const run = useCallback(async (url) => {
    const runId = (runIdRef.current += 1)
    const alive = () => runIdRef.current === runId

    setStatus('cached')
    setScan(null)
    setAnalysis(null)
    setFromCache(false)
    setError(null)

    try {
      const hit = await readCache(url)
      if (!alive()) return
      if (hit?.scan && hit?.analysis) {
        setScan(hit.scan)
        setAnalysis(hit.analysis)
        setFromCache(true)
        setStatus('done')
        return
      }

      setStatus('scanning')
      const scanResult = await submitAndPoll(url, { isCancelled: () => !alive() })
      if (!alive() || !scanResult) return
      setScan(scanResult)

      setStatus('analysing')
      const analysisResult = await analyzeScreenshot(scanResult)
      if (!alive()) return
      setAnalysis(analysisResult)
      setStatus('done')

      // Only cache a complete result — a half-finished entry would poison the
      // demo more surely than no entry at all.
      writeCache(url, { cachedAt: new Date().toISOString(), scan: scanResult, analysis: analysisResult })
    } catch (err) {
      if (!alive()) return
      setError(err.message)
      setStatus('error')
    }
  }, [])

  return { status, scan, analysis, fromCache, error, run, reset }
}

export default usePipeline
