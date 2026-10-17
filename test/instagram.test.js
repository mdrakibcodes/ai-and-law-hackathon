import { test } from 'node:test'
import assert from 'node:assert/strict'
import { instagramProfileLink } from '../src/instagram.js'

test('recognizes the supplied profile link and reconstructs an official destination without tracking', () => {
  assert.deepEqual(instagramProfileLink('https://www.instagram.com/perthpixelmedia?igsh=M2tsNDA3YXlleG1k&utm_source=qr'), {
    username: 'perthpixelmedia', url: 'https://www.instagram.com/perthpixelmedia/',
  })
  assert.equal(instagramProfileLink('https://instagram.com/a.b_12/').url, 'https://www.instagram.com/a.b_12/')
})
test('does not treat lookalikes, redirect routes or unsupported Instagram links as profiles', () => {
  for (const url of [
    'https://instagram.com.evil.example/perthpixelmedia',
    'https://instagram.example/perthpixelmedia',
    'https://l.instagram.com/perthpixelmedia',
    'https://instagram.com@evil.example/perthpixelmedia',
    'https://user:password@instagram.com/perthpixelmedia',
    'http://instagram.com/perthpixelmedia',
    'https://instagram.com:444/perthpixelmedia',
    'https://instagram.com/accounts',
    'https://instagram.com/direct/',
    'https://instagram.com/p/postid',
    'https://instagram.com/',
    'https://instagram.com/perthpixelmedia?url=https://evil.example',
    'https://instagram.com/perthpixelmedia#unknown',
    'https://instagram.com/.invalid',
    'https://instagram.com/a..b',
    'https://instagram.com/abc%2Fdef',
  ]) assert.equal(instagramProfileLink(url), null, url)
})
