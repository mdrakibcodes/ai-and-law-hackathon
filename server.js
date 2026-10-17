import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installCheckRoute } from './scan-service.js'
import scanCache from './vite-plugin-scan-cache.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const production = process.env.NODE_ENV === 'production'
if (production && (!process.env.URLSCAN_KEY || !process.env.APP_OPENAI_API_KEY)) {
  throw new Error('Set URLSCAN_KEY and APP_OPENAI_API_KEY before starting production.')
}
app.disable('x-powered-by')
app.get('/healthz', (_req, res) => res.json({ ok: true, analysisPolicy: 'landing-pages-v3', commit: process.env.RENDER_GIT_COMMIT || null }))
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('Referrer-Policy', 'same-origin')
  next()
})
// Keep runtime writes outside the checkout and on the host's persistent disk.
const dataDir = process.env.DATA_DIR || path.join(root, '.data')
fs.mkdirSync(dataDir, { recursive: true })
for (const file of ['scan-cache.json', 'scan-pins.json']) {
  const target = path.join(dataDir, file)
  if (!fs.existsSync(target)) fs.writeFileSync(target, file === 'scan-cache.json' ? '{}' : '[]')
}
app.use('/api/check', express.json({ limit: '8kb' }))
installCheckRoute(app, { dataDir })
const stores = scanCache({
  cacheFile: path.join(dataDir, 'scan-cache.json'),
  pinsFile: path.join(dataDir, 'scan-pins.json'),
})
stores.configResolved({ root })
// Reuse the development API implementation with production storage paths.
app.use('/api', (req, res, next) => {
  if (req.method === 'DELETE' || (req.path.startsWith('/cache') && req.method !== 'GET')) return res.sendStatus(405)
  next()
})
stores.configureServer({ middlewares: app, config: { logger: console } })
app.use('/api', (_req, res) => res.sendStatus(404))
app.use(express.static(path.join(root, 'dist')))
app.get('/', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
const port = Number(process.env.PORT || 3000)
app.listen(port, '0.0.0.0', () => console.log(`QR Check listening on port ${port}`))
