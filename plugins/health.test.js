import { test } from 'node:test'
import * as assert from 'node:assert'
import { build } from '../test/helper.js'

test('healthcheck baseline test', async (t) => {
  const app = await build(t)
  const res = await app.inject({
    url: '/health',
  })
  assert.equal(res.payload, '{"statusCode":200,"status":"ok"}')
})
