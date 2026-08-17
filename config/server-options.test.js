import { test } from 'node:test'
import * as assert from 'node:assert'
import { parsePositiveIntegerEnv } from './server-options.js'

test('parsePositiveIntegerEnv uses the fallback when unset', () => {
  assert.strictEqual(parsePositiveIntegerEnv('TIMEOUT_MS', undefined, 30000), 30000)
})

test('parsePositiveIntegerEnv parses a positive integer', () => {
  assert.strictEqual(parsePositiveIntegerEnv('TIMEOUT_MS', '120000', 30000), 120000)
})

test('parsePositiveIntegerEnv rejects invalid values', () => {
  for (const value of ['0', '-1', '1.5', 'nope']) {
    assert.throws(
      () => parsePositiveIntegerEnv('TIMEOUT_MS', value, 30000),
      { message: 'TIMEOUT_MS must be a positive integer' }
    )
  }
})
