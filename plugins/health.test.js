import { test } from 'node:test'
import * as assert from 'node:assert'
import Fastify from 'fastify'
import { build } from '../test/helper.js'
import { options } from '../config/server-options.js'
import health from './health.js'

test('healthcheck baseline test', async (t) => {
  const app = await build(t)
  const res = await app.inject({
    url: '/health',
  })
  assert.equal(res.payload, '{"statusCode":200,"status":"ok"}')
})

test('healthcheck request logs use debug level', async (t) => {
  /** @type {Array<{level?: number, msg?: string, reqId?: string}>} */
  const records = []
  const stream = {
    write (/** @type {string} */ line) {
      records.push(JSON.parse(line))
    },
  }
  const app = Fastify({
    disableRequestLogging: options.disableRequestLogging,
    logger: {
      level: 'trace',
      stream,
    },
  })
  t.after(() => app.close())
  await app.register(health)

  await app.inject({ url: '/health' })

  assert.deepEqual(
    records
      .filter(record => record.reqId)
      .map(record => ({ level: record.level, message: record.msg })),
    [
      { level: 20, message: 'incoming request' },
      { level: 20, message: 'request completed' },
    ]
  )
})
