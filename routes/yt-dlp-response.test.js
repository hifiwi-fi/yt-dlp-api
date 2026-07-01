import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeYtDlpUri } from './yt-dlp-response.js'

test('normalizeYtDlpUri preserves absolute URLs', () => {
  const url = 'https://x.com/MTSlive/status/2062564653310394674#m'

  assert.strictEqual(normalizeYtDlpUri(url), url)
})

test('normalizeYtDlpUri drops non-URI placeholders', () => {
  assert.strictEqual(normalizeYtDlpUri('#'), null)
  assert.strictEqual(normalizeYtDlpUri(''), null)
  assert.strictEqual(normalizeYtDlpUri(null), null)
  assert.strictEqual(normalizeYtDlpUri(undefined), null)
})
