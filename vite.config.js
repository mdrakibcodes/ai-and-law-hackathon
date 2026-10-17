import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { HttpsProxyAgent } from 'https-proxy-agent'
import scanCache from './vite-plugin-scan-cache.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Read .env as well as the real environment, so both of these work:
  //   echo "URLSCAN_KEY=xxx" > .env  &&  npm run dev
  //   URLSCAN_KEY=xxx npm run dev
  // Third arg '' = load every key, not just VITE_-prefixed ones. Neither key
  // is ever exposed to the browser — both are injected here, server-side.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const urlscanKey = env.URLSCAN_KEY ?? ''
  const openaiKey = env.APP_OPENAI_API_KEY ?? ''
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined

  const missing = [
    !urlscanKey && 'URLSCAN_KEY (https://urlscan.io/user/profile/)',
    !openaiKey && 'APP_OPENAI_API_KEY (https://platform.openai.com/api-keys)',
  ].filter(Boolean)

  if (missing.length) {
    console.warn(`\n  Missing from .env:\n${missing.map((m) => `    - ${m}`).join('\n')}\n`)
  }

  return {
    plugins: [react(), scanCache()],
    server: {
      proxy: {
        // Neither API sends CORS headers, so the browser can't call them
        // directly. The dev server proxies both and injects the keys.
        '/urlscan': {
          target: 'https://urlscan.io',
          agent,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/urlscan/, ''),
          headers: { 'API-Key': urlscanKey },
        },
        '/openai': {
          target: 'https://api.openai.com',
          agent,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/openai/, ''),
          headers: { Authorization: `Bearer ${openaiKey}` },
        },
      },
    },
  }
})
