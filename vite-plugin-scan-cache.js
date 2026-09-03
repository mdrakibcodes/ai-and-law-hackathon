import fs from 'node:fs'
import path from 'node:path'

/**
 * Dev-only JSON stores, persisted to plain files in the project root so they
 * survive restarts, can be inspected by hand, and can be cleared by deleting
 * the file. No database for a hackathon prototype.
 *
 * scan-cache.json — completed scans keyed by URL. urlscan is slow and
 * occasionally flaky, so a repeat scan should be instant and identical.
 *   GET    /api/cache            -> { [url]: entry }
 *   GET    /api/cache?url=...    -> entry | 404
 *   PUT    /api/cache            <- { url, entry }
 *   DELETE /api/cache[?url=...]  -> clears all, or one
 *
 * scan-pins.json — map pins people chose to share, newest first.
 *   GET    /api/pins             -> [pin, ...]
 *   POST   /api/pins             <- pin  (an id and timestamp are added here)
 *   DELETE /api/pins             -> clears all
 */
export default function scanCachePlugin({
  cacheFile = 'scan-cache.json',
  pinsFile = 'scan-pins.json',
} = {}) {
  let root

  const load = (file, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'))
    } catch {
      // Missing, or hand-edited into invalid JSON — start fresh rather than
      // taking the dev server down mid-demo.
      return fallback
    }
  }

  const save = (file, data) => {
    fs.writeFileSync(path.resolve(root, file), `${JSON.stringify(data, null, 2)}\n`)
  }

  const json = (res, status, body) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk
      })
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {})
        } catch (err) {
          reject(err)
        }
      })
      req.on('error', reject)
    })

  return {
    name: 'scan-stores',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      server.middlewares.use('/api/cache', async (req, res) => {
        const url = new URL(req.url, 'http://localhost').searchParams.get('url')
        try {
          if (req.method === 'GET') {
            const cache = load(cacheFile, {})
            if (!url) return json(res, 200, cache)
            return cache[url]
              ? json(res, 200, cache[url])
              : json(res, 404, { message: 'not cached' })
          }
          if (req.method === 'PUT') {
            const { url: key, entry } = await readBody(req)
            if (!key) return json(res, 400, { message: 'url required' })
            const cache = load(cacheFile, {})
            cache[key] = entry
            save(cacheFile, cache)
            server.config.logger.info(`  [cache] saved ${key}`)
            return json(res, 200, { ok: true })
          }
          if (req.method === 'DELETE') {
            if (url) {
              const cache = load(cacheFile, {})
              delete cache[url]
              save(cacheFile, cache)
              return json(res, 200, { ok: true, cleared: url })
            }
            save(cacheFile, {})
            server.config.logger.info('  [cache] cleared')
            return json(res, 200, { ok: true, cleared: 'all' })
          }
          return json(res, 405, { message: 'method not allowed' })
        } catch (err) {
          return json(res, 500, { message: err.message })
        }
      })

      server.middlewares.use('/api/pins', async (req, res) => {
        try {
          if (req.method === 'GET') {
            return json(res, 200, load(pinsFile, []))
          }
          if (req.method === 'POST') {
            const pin = await readBody(req)
            if (typeof pin.lat !== 'number' || typeof pin.lng !== 'number') {
              return json(res, 400, { message: 'lat and lng required' })
            }
            const pins = load(pinsFile, [])

            // Re-scanning the same sticker from the same spot should refresh
            // the existing pin, not stack an invisible duplicate on top of it.
            const existing = pins.findIndex(
              (p) => p.url === pin.url && p.lat === pin.lat && p.lng === pin.lng,
            )
            if (existing !== -1) {
              const updated = {
                ...pins[existing],
                ...pin,
                // Keep the earlier photo if this scan didn't supply one.
                photo: pin.photo ?? pins[existing].photo ?? null,
                count: (pins[existing].count ?? 1) + 1,
                at: new Date().toISOString(),
              }
              pins.splice(existing, 1)
              pins.unshift(updated)
              save(pinsFile, pins)
              server.config.logger.info(`  [pins] updated ${updated.verdict} @ ${updated.lat},${updated.lng} (seen ${updated.count}x)`)
              return json(res, 200, updated)
            }

            const saved = {
              ...pin,
              photo: pin.photo ?? null,
              count: 1,
              id: `pin_${Date.now()}_${pins.length}`,
              at: new Date().toISOString(),
            }
            pins.unshift(saved)
            save(pinsFile, pins)
            server.config.logger.info(`  [pins] added ${saved.verdict} @ ${saved.lat},${saved.lng}`)
            return json(res, 200, saved)
          }
          if (req.method === 'DELETE') {
            save(pinsFile, [])
            server.config.logger.info('  [pins] cleared')
            return json(res, 200, { ok: true, cleared: 'all' })
          }
          return json(res, 405, { message: 'method not allowed' })
        } catch (err) {
          return json(res, 500, { message: err.message })
        }
      })
    },
  }
}
