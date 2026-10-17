import https from 'node:https'
import { HttpsProxyAgent } from 'https-proxy-agent'
import fs from 'node:fs'
import path from 'node:path'
import { summarizePage } from './page-evidence.js'
import { analysisRequest, parseAnalysis } from './src/analyze.js'

export function normalizeUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Enter a valid http or https link.')
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Enter a valid http or https link without embedded credentials.')
  }
  return url.href
}

export function createScanService({ env = process.env, dataDir, request: customRequest, pause = ms => new Promise(r => setTimeout(r, ms)) }) {
  const proxy = env.HTTPS_PROXY || env.HTTP_PROXY
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined
  // A separate store excludes all historic client-supplied verdicts.
  fs.mkdirSync(dataDir, { recursive: true })
  const cacheFile = path.join(dataDir, 'verified-scans-v3.json')
  let cache = {}
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) } catch { /* First startup. */ }
  const inFlight = new Map()
  const requests = []
  const request = customRequest || ((url, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const encoded = body === undefined ? undefined : JSON.stringify(body)
    const req = https.request(url, { method, agent, headers: {
      ...headers,
      ...(encoded ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(encoded) } : {}),
    } }, res => {
      const chunks = []
      let size = 0
      res.on('data', chunk => {
        size += chunk.length
        if (size > 12 * 1024 * 1024) { res.destroy(new Error('The scan response was too large.')); return }
        chunks.push(chunk)
      })
      res.on('error', reject)
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.setTimeout(25000, () => req.destroy(new Error('The scan service timed out. Please retry.')))
    req.end(encoded)
  }))
  const json = response => {
    try { return JSON.parse(response.bytes.toString()) } catch { throw new Error('The scan service returned an unreadable response. Please retry.') }
  }
  const upstream = async (route, options) => {
    const res = await request(`https://urlscan.io${route}`, { ...options, headers: { 'API-Key': env.URLSCAN_KEY } })
    if (res.status === 401 || res.status === 403) throw new Error('Website scanning is unavailable. The site owner must check the urlscan API key.')
    if (res.status === 429) throw new Error('Website scanning is busy. Please try again shortly.')
    return res
  }
  return async value => {
    const url = normalizeUrl(value)
    const hit = cache[url]
    if (hit && Date.now() - Date.parse(hit.cachedAt) < 60 * 60 * 1000) return { ...hit, fromCache: true }
    if (inFlight.has(url)) return inFlight.get(url)
    while (requests.length && requests[0] < Date.now() - 60000) requests.shift()
    if (requests.length >= 10 || inFlight.size >= 3) throw new Error('The scanner is busy. Please try again in a minute.')
    requests.push(Date.now())
    const operation = (async () => {
      if (!env.URLSCAN_KEY || !env.APP_OPENAI_API_KEY) throw new Error('Scanning is not configured. The site owner must add both API keys.')
      const submitted = await upstream('/api/v1/scan/', { method: 'POST', body: { url, visibility: 'public' } })
      if (submitted.status === 400) throw new Error('The scanning provider declined this URL. Safety could not be verified, so the site has not been opened.')
      if (submitted.status !== 200 && submitted.status !== 201) throw new Error(`Website scanning could not start (${submitted.status}). The site has not been opened.`)
      const { uuid } = json(submitted)
      if (typeof uuid !== 'string' || !/^[a-f0-9-]{36}$/i.test(uuid)) throw new Error('The scanner did not return a valid scan ID.')
      let result
      for (let i = 0; i < 30; i++) {
        await pause(3000)
        const polled = await upstream(`/api/v1/result/${uuid}/`)
        if (polled.status === 404) continue // urlscan returns 404 until processing finishes.
        if (polled.status !== 200) throw new Error('Could not retrieve the website scan. Please retry.')
        result = json(polled)
        break
      }
      if (!result) throw new Error('Website scanning took too long. Please retry; the site has not been opened.')
      const scan = {
        uuid, scannedUrl: url, finalUrl: result.page?.url ?? null,
        title: result.page?.title ?? null, pageStatusCode: result.page?.status ?? null,
        finalDomain: result.page?.domain ?? null,
        malicious: result.verdicts?.overall?.malicious ?? null,
        score: result.verdicts?.overall?.score ?? null,
        screenshotUrl: `https://urlscan.io/screenshots/${uuid}.png`,
        reportUrl: `https://urlscan.io/result/${uuid}/`,
      }
      let image
      for (let i = 0; i < 4; i++) {
        image = await upstream(`/screenshots/${uuid}.png`)
        if (image.status !== 404) break
        await pause(2000)
      }
      const imageAvailable = image.status === 200 && image.bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      if (!imageAvailable) scan.screenshotUrl = null
      let pageEvidence = null
      // DOM extraction supplies survey questions which screenshots can truncate.
      // An unavailable DOM is optional; a readable screenshot can still be assessed.
      try {
        const dom = await upstream(`/dom/${uuid}/`)
        if (dom.status === 200 && dom.bytes.length) {
          pageEvidence = summarizePage(dom.bytes.toString(), scan.finalUrl || url)
        }
      } catch { /* Keep screenshot analysis available if optional DOM retrieval fails. */ }
      if (!imageAvailable && (!pageEvidence || pageEvidence.text.length < 80)) {
        throw new Error('The website screenshot is unavailable and there is not enough page text to inspect. No safety verdict is available.')
      }
      const ai = await request('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${env.APP_OPENAI_API_KEY}` },
        body: analysisRequest(scan, imageAvailable ? image.bytes.toString('base64') : null, pageEvidence),
      })
      if (ai.status !== 200) throw new Error(`AI analysis is unavailable (${ai.status}). The site has not been opened.`)
      const analysis = parseAnalysis(json(ai))
      if (analysis.page_status !== 'readable') analysis.verdict = 'unverified'
      if (scan.malicious === true || !scan.finalDomain) {
        analysis.verdict = scan.malicious ? 'dangerous' : 'unverified'
        analysis.reasons.unshift(scan.malicious ? 'The website scan flagged this page as malicious.' : 'The serving domain could not be verified.')
      }
      const entry = { cachedAt: new Date().toISOString(), scan, analysis }
      cache[url] = entry
      // Bound the disk cache and write atomically.
      cache = Object.fromEntries(Object.entries(cache).slice(-200))
      fs.writeFileSync(`${cacheFile}.tmp`, JSON.stringify(cache))
      fs.renameSync(`${cacheFile}.tmp`, cacheFile)
      return { ...entry, fromCache: false }
    })()
    inFlight.set(url, operation)
    try { return await operation } finally { inFlight.delete(url) }
  }
}

export function installCheckRoute(app, options) {
  const check = createScanService(options)
  app.post('/api/check', async (req, res) => {
    try {
      const result = await check(req.body?.url)
      res.setHeader('Cache-Control', 'no-store')
      res.json(result)
    } catch (error) {
      res.status(422).json({ assessment: 'unverified', message: error.message })
    }
  })
}
