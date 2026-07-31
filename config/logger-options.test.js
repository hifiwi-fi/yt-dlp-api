import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loggerOptions } from './logger-options.js'

test('redacts sensitive URL data while preserving YouTube video IDs', () => {
  const redact = /** @type {Exclude<typeof loggerOptions.redact, string[]>} */ (loggerOptions.redact)
  const censor = /** @type {(value: unknown) => unknown} */ (redact.censor)

  assert.equal(censor(null), null)
  assert.equal(censor(undefined), undefined)
  assert.equal(censor({ query: 'secret' }), '[Redacted]')
  assert.equal(
    censor('https://user:password@cdn.example.com/audio.mp3?Signature=secret#token'),
    'https://cdn.example.com/audio.mp3'
  )
  assert.equal(
    censor('https://www.youtube.com/watch?v=abc123&si=secret'),
    'https://www.youtube.com/watch?v=abc123'
  )
  assert.equal(
    censor('/unified?url=https%3A%2F%2Fcdn.example.com%2Fa.mp3%3FSignature%3Dsecret'),
    '/unified'
  )
  assert.equal(
    censor('Unable to download https://cdn.example.com/audio.mp3?Signature=secret HTTP 403'),
    'Unable to download https://cdn.example.com/audio.mp3 HTTP 403'
  )
  assert.equal(
    censor('Unable to download (https://cdn.example.com/audio.mp3?Signature=secret), retrying.'),
    'Unable to download (https://cdn.example.com/audio.mp3), retrying.'
  )
})
