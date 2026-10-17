import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createScanService, normalizeUrl } from '../scan-service.js'
import { summarizePage } from '../page-evidence.js'
import { safeDestination } from '../src/navigation.js'

const uuid = '11111111-1111-1111-1111-111111111111'
const analysis = {
  page_status: 'readable', page_type: 'website', suspected_brand: 'Example', impersonation_probability: 0, phishing_probability: 0,
  requests_sensitive_data: false, data_requested: [], visual_signals: ['Readable page'],
  reasons: ['Brand matches domain'], verdict: 'safe',
}
function fixture(t, { malicious = false, missingImage = false, refuse = false, declined = false, analysisOverride = {}, domHtml = null } = {}) {
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
      } else if (url.includes('/dom/')) {
        return { status: domHtml ? 200 : 404, bytes: Buffer.from(domHtml || '') }
      } else if (url.endsWith('.png')) {
        return { status: missingImage ? 404 : 200, bytes: Buffer.from([137,80,78,71,13,10,26,10]) }
      } else body = { choices: [{ finish_reason: 'stop', message: refuse ? { refusal: 'Declined' } : { content: JSON.stringify({ ...analysis, ...analysisOverride }) } }] }
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
  for (const verdict of ['dangerous', 'suspicious', 'unverified', undefined]) {
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

test('missing inspection is unverified even if the AI incorrectly returns safe', async t => {
  const { service } = fixture(t, { analysisOverride: { page_status: 'login_required' } })
  const result = await service('https://example.com/')
  assert.equal(result.analysis.verdict, 'unverified')
  assert.equal(safeDestination(result.scan.scannedUrl, result.scan, result.analysis), null)
})
test('normal readable survey is eligible to open without a known brand', async t => {
  const { service, calls } = fixture(t, {
    analysisOverride: { page_type: 'feedback_survey', suspected_brand: 'unclear' },
    domHtml: '<title>Feedback</title><form><label for="rating">Rating</label><select id="rating" name="rating"><option>Great</option></select><label for="email">Optional email</label><input id="email" type="email"></form>',
  })
  const result = await service('https://example.com/')
  assert.equal(safeDestination(result.scan.scannedUrl, result.scan, result.analysis), 'https://example.com/')
  const ai = calls.find(c => c.url.includes('openai.com'))
  assert.match(ai.options.body.messages[1].content[1].text, /Optional email/)
  assert.match(ai.options.body.messages[1].content[1].text, /Rating/)
})
test('unsafe survey remains blocked even on a familiar form provider', async t => {
  const { service } = fixture(t, { analysisOverride: {
    verdict: 'dangerous', page_type: 'feedback_survey', phishing_probability: 95,
    requests_sensitive_data: true, data_requested: ['Bank password', 'One-time code'],
    reasons: ['A feedback form asks for banking credentials.'],
  } })
  const result = await service('https://docs.google.com/forms/d/e/example/viewform')
  assert.equal(result.analysis.verdict, 'dangerous')
  assert.equal(safeDestination(result.scan.scannedUrl, result.scan, result.analysis), null)
})

test('DOM evidence extracts survey questions and destinations, excluding scripts and prefilled values', () => {
  const evidence = summarizePage('<title>Feedback</title><script>ignored-script</script><form action="/answers" method="post"><label for="comment">Your feedback</label><textarea id="comment">private-comment</textarea><label>Email<input type="email" value="private-email"></label><input type="hidden" value="private-token"></form>', 'https://survey.example/feedback')
  assert.equal(evidence.fields.length, 2)
  assert.equal(evidence.fields[0].label, 'Your feedback')
  assert.equal(evidence.forms[0].action, 'https://survey.example/answers')
  assert.doesNotMatch(JSON.stringify(evidence), /ignored-script|private-comment|private-email|private-token/)
})

test('readable DOM can be analysed when a screenshot is unavailable', async t => {
  const { service, calls } = fixture(t, {
    missingImage: true,
    domHtml: '<title>Workshop feedback</title><h1>Community workshop feedback survey</h1><p>Please rate the workshop and leave any comments. You may optionally provide contact details for follow-up.</p><form><label>Rating<input name="rating"></label></form>',
    analysisOverride: { page_type: 'feedback_survey' },
  })
  const result = await service('https://example.com/')
  assert.equal(result.analysis.verdict, 'safe')
  assert.equal(result.scan.screenshotUrl, null)
  const ai = calls.find(c => c.url.includes('openai.com'))
  assert.equal(ai.options.body.messages[1].content.some(c => c.type === 'image_url'), false)
  assert.match(ai.options.body.messages[1].content[0].text, /workshop/)
})

test('visible app landing page is allowed while a hidden private document remains unverified', async t => {
  const landing = fixture(t, { analysisOverride: {
    suspected_brand: 'ChatGPT', page_status: 'readable', verdict: 'safe',
    reasons: ['The public landing page has a message composer and optional sign-in buttons.'],
  } })
  const result = await landing.service('https://www.chatgpt.com/')
  assert.equal(result.analysis.verdict, 'safe')
  assert.equal(safeDestination(result.scan.scannedUrl, result.scan, result.analysis), result.scan.scannedUrl)
  const hidden = fixture(t, { analysisOverride: {
    page_status: 'login_required', verdict: 'unverified', reasons: ['Sign-in hides the requested private form.'],
  } })
  const privateResult = await hidden.service('https://example.com/private-survey')
  assert.equal(safeDestination(privateResult.scan.scannedUrl, privateResult.scan, privateResult.analysis), null)
})
