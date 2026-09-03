import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
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
  const anthropicKey = env.ANTHROPIC_API_KEY ?? ''
  // Identity-linked / organisation-scoped keys must name the workspace the
  // request acts in. Workspace-scoped keys imply it, so this stays optional.
  const anthropicWorkspace = env.ANTHROPIC_WORKSPACE_ID ?? ''

  const missing = [
    !urlscanKey && 'URLSCAN_KEY (https://urlscan.io/user/profile/)',
    !anthropicKey && 'ANTHROPIC_API_KEY (https://console.anthropic.com/settings/keys)',
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
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/urlscan/, ''),
          headers: { 'API-Key': urlscanKey },
        },
        '/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/anthropic/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              // setHeader overwrites the placeholder key the browser SDK sends.
              proxyReq.setHeader('x-api-key', anthropicKey)
              if (anthropicWorkspace) {
                proxyReq.setHeader('anthropic-workspace-id', anthropicWorkspace)
              }
            })
          },
        },
      },
    },
  }
})
