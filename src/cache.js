/**
 * Client for the dev-server scan cache (see vite-plugin-scan-cache.js).
 * Backed by scan-cache.json in the project root — delete that file, or call
 * clearCache(), to start fresh.
 */

export async function readCache(url) {
  try {
    const res = await fetch(`/api/cache?url=${encodeURIComponent(url)}`)
    return res.ok ? await res.json() : null
  } catch {
    // A cache miss must never break a scan.
    return null
  }
}

export async function writeCache(url, entry) {
  try {
    await fetch('/api/cache', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, entry }),
    })
  } catch {
    // Non-fatal — the scan already succeeded.
  }
}

export async function clearCache() {
  await fetch('/api/cache', { method: 'DELETE' })
}
