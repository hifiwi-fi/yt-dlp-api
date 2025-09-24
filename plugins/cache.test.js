import { test } from 'node:test'
import * as assert from 'node:assert'
import { build } from '../test/helper.js'

test('cache plugin loads correctly', async (t) => {
  const app = await build(t)

  await app.ready()

  // Test that cache decorator is available
  assert.ok(app.cache, 'cache decorator should be available')
  assert.equal(typeof app.cache.get, 'function', 'cache.get should be a function')
  assert.equal(typeof app.cache.set, 'function', 'cache.set should be a function')
})
