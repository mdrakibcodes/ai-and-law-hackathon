import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createScanService, normalizeUrl } from '../scan-service.js'
import { safeDestination } from '../src/navigation.js'

const uuid = '11111111-1111-1111-1111-111111111111'
const analysis = {
  suspected_brand: 'Example', impersonation_probability: 0, phishing_probability: 0,
  requests_sensitive_data: false, data_requested: [], visual_signals: ['Readable page'],
  reasons: ['Brand matches domain'], verdict: 'safe',
}
function fixture(t, { malicious = false, missingImage = false, refuse = false, declined = false } = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'qr-service-test-'))
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))
  const calls = []
  let polls = 0
  const service = createScanService({
    dataDir, env: { URLSCAN_KEY: 'test', APP_OPENAI_API_KEY: 'test' }, pause: async () => {},
    request: async (url, options) => {
      calls.push({ url, options })
      let body, status = 200
      if (url.endsWith('/scan/')) { body = { uuid }; if (declined) status = 400 }
      else if (url.includes('/result/')) {
        if (polls++ === 0) { status = 404; body = {} }
        else body = { page: { domain: 'example.com' }, verdicts: { overall: { malicious, score: 0 } } }
      } else if (url.endsWith('.png')) {
        return { status: missingImage ? 404 : 200, bytes: Buffer.from([137,80,78,71,13,10,26,10]) }
      } else body = { choices: [{ finish_reason: 'stop', message: refuse ? { refusal: 'Declined' } : { content: JSON.stringify(analysis) } }] }
      return { status, bytes: Buffer.from(JSON.stringify(body)) }
    },
  })
  return { service, calls, dataDir }
}
test('pending 404 is retried, scan is analysed with fixed settings, server cache is reused', async t => {
  const { service, calls, dataDir } = fixture(t)
  // The previous public cache must never authorize a redirect.
  writeFileSync(path.join(dataDir, 'scan-cache.json'), JSON.stringify({ 'https://example.com/': { analysis } }))
  const result = await service('https://example.com/')
  assert.equal(result.analysis.verdict, 'safe')
  assert.equal(result.fromCache, false)
  assert.equal(calls.filter(c => c.url.includes('/result/')).length, 2)
  const ai = calls.find(c => c.url.includes('openai.com'))
  assert.equal(ai.options.body.model, 'gpt-4.1-mini')
  assert.equal(ai.options.body.max_completion_tokens, 2000)
  const count = calls.length
  assert.equal((await service('https://example.com/')).fromCache, true)
  assert.equal(calls.length, count)
})
test('malicious scanner verdict overrides a safe AI result and blocks navigation', async t => {
  const { service } = fixture(t, { malicious: true })
  const result = await service('https://example.com/')
  assert.equal(result.analysis.verdict, 'dangerous')
  assert.equal(safeDestination('https://example.com/', result.scan, result.analysis), null)
})
test('missing screenshots and AI refusals never produce a safe verdict', async t => {
  const missing = fixture(t, { missingImage: true })
  await assert.rejects(missing.service('https://example.com/'), /screenshot is unavailable/)
  assert.equal(missing.calls.some(c => c.url.includes('openai.com')), false)
  const refusal = fixture(t, { refuse: true })
  await assert.rejects(refusal.service('https://example.com/'), /could not verify/)
})
test('navigation requires a matching scanned HTTP URL, safe AI verdict and no malicious scan', () => {
  const scan = { scannedUrl: 'https://example.com/', finalDomain: 'example.com', malicious: false }
  assert.equal(safeDestination(scan.scannedUrl, scan, analysis), scan.scannedUrl)
  for (const verdict of ['dangerous', 'suspicious', undefined]) {
    assert.equal(safeDestination(scan.scannedUrl, scan, { ...analysis, verdict }), null)
  }
  assert.equal(safeDestination('https://other.example/', scan, analysis), null)
  assert.equal(safeDestination('javascript:alert(1)', scan, analysis), null)
  assert.throws(() => normalizeUrl('javascript:alert(1)'))
  assert.throws(() => normalizeUrl('https://user:password@example.com/'))
})

test('a provider-declined URL is not labelled safe or sent to OpenAI', async t => {
  const { service, calls } = fixture(t, { declined: true })
  await assert.rejects(service('https://example.com/'), /provider declined this URL/)
  assert.equal(calls.length, 1)
})
