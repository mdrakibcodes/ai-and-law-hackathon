const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 90000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const MISSING_KEY_HINT =
  'urlscan rejected the request (no API key?). Put URLSCAN_KEY=... in .env and restart the dev server.'

/**
 * Submits a URL to urlscan.io and polls until the sandbox result is ready.
 * Both endpoints need the key and send no CORS headers, so both go through the
 * Vite proxy at /urlscan. Returns the fields the rest of the app cares about.
 */
export async function submitAndPoll(url, { isCancelled = () => false } = {}) {
  const res = await fetch('/urlscan/api/v1/scan/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, visibility: 'public' }),
  })
  const body = await res.json().catch(() => ({}))

  if (res.status === 401 || res.status === 403) {
    throw new Error(body.message || MISSING_KEY_HINT)
  }
  if (res.status === 429) {
    throw new Error('urlscan rate limit hit — wait a minute and try again.')
  }
  if (!res.ok) {
    throw new Error(body.message || body.description || `urlscan returned ${res.status}`)
  }

  const uuid = body.uuid
  if (!uuid) throw new Error('urlscan did not return a scan id')

  // The result 404s until the sandbox has finished rendering the page.
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    if (isCancelled()) return null

    const poll = await fetch(`/urlscan/api/v1/result/${uuid}/`)
    if (poll.status === 404) continue
    if (poll.status === 401 || poll.status === 403) throw new Error(MISSING_KEY_HINT)
    if (!poll.ok) throw new Error(`urlscan result returned ${poll.status}`)

    const data = await poll.json()
    return {
      uuid,
      scannedUrl: data.task?.url ?? url,
      finalDomain: data.page?.domain ?? null,
      malicious: data.verdicts?.overall?.malicious ?? null,
      score: data.verdicts?.overall?.score ?? null,
      screenshotUrl: data.task?.screenshotURL ?? `https://urlscan.io/screenshots/${uuid}.png`,
      reportUrl: `https://urlscan.io/result/${uuid}/`,
    }
  }

  throw new Error('urlscan timed out — the scan is taking longer than usual.')
}
