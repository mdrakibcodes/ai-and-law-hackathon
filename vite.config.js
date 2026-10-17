import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import express from 'express'
import path from 'node:path'
import scanCache from './vite-plugin-scan-cache.js'
import { installCheckRoute } from './scan-service.js'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  return {
    plugins: [react(), {
      name: 'server-side-check',
      configureServer(server) {
        const router = express()
        router.use('/api/check', express.json({ limit: '8kb' }))
        installCheckRoute(router, { env, dataDir: path.resolve('.data') })
        router.use('/api/cache', (req, res, next) => {
          if (req.method !== 'GET') return res.sendStatus(405)
          next()
        })
        server.middlewares.use(router)
      },
    }, scanCache()],
  }
})
