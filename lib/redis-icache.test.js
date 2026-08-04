/** @import { FastifyInstance } from 'fastify' */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import test from 'node:test'
import { BroadcastChannel } from 'node:worker_threads'
import pino from 'pino'
import { createRedisCacheDispatcher } from './redis-cache-dispatcher.js'
import { RedisICache } from './redis-icache.js'

/**
 * @typedef {Object} RedisCall
 * @property {'get' | 'setex' | 'del'} operation
 * @property {string} key
 * @property {number | undefined} ttl
 */

const logger = pino({ level: 'silent' })

/**
 * @param {(key: string) => number} [getDelay]
 * @param {Error | null} [getError]
 */
function createRedisStub (getDelay = () => 0, getError = null) {
  /** @type {Map<string, Buffer>} */
  const values = new Map()
  /** @type {RedisCall[]} */
  const calls = []

  const redis = /** @type {FastifyInstance['redis']} */ (/** @type {unknown} */ ({
    async getBuffer (key) {
      calls.push({ operation: 'get', key, ttl: undefined })
      if (getError) throw getError
      const delay = getDelay(key)
      if (delay > 0) await sleep(delay)
      const value = values.get(key)
      return value === undefined ? null : Buffer.from(value)
    },
    async setex (key, ttl, value) {
      calls.push({ operation: 'setex', key, ttl })
      values.set(key, Buffer.from(value))
      return 'OK'
    },
    async del (key) {
      calls.push({ operation: 'del', key, ttl: undefined })
      return values.delete(key) ? 1 : 0
    }
  }))

  return { calls, redis, values }
}

test('RedisICache executes binary cache operations through the real dispatcher', async (t) => {
  const channelName = `redis-icache-test-${randomUUID()}`
  const { calls, redis } = createRedisStub()
  const dispatcher = createRedisCacheDispatcher(channelName, redis, logger)
  const cache = new RedisICache(new BroadcastChannel(channelName))
  t.after(() => {
    cache.close()
    dispatcher.close()
  })

  const value = Uint8Array.from([0, 1, 127, 128, 255]).buffer
  await cache.set('binary', value)
  assert.deepEqual(new Uint8Array(await cache.get('binary')), new Uint8Array(value))

  await cache.remove('binary')
  assert.equal(await cache.get('binary'), undefined)
  assert.deepEqual(calls, [
    { operation: 'setex', key: 'binary', ttl: 172_800 },
    { operation: 'get', key: 'binary', ttl: undefined },
    { operation: 'del', key: 'binary', ttl: undefined },
    { operation: 'get', key: 'binary', ttl: undefined }
  ])
})

test('RedisICache isolates overlapping responses for different worker clients', async (t) => {
  const channelName = `redis-icache-test-${randomUUID()}`
  const { redis, values } = createRedisStub((key) => key === 'slow' ? 20 : 0)
  values.set('slow', Buffer.from([1, 2, 3]))
  values.set('fast', Buffer.from([4, 5, 6]))

  const dispatcher = createRedisCacheDispatcher(channelName, redis, logger)
  const slowCache = new RedisICache(new BroadcastChannel(channelName))
  const fastCache = new RedisICache(new BroadcastChannel(channelName))
  t.after(() => {
    slowCache.close()
    fastCache.close()
    dispatcher.close()
  })

  // Both cache instances start at request ID 1, and the fast response arrives first.
  const [slowResult, fastResult] = await Promise.all([
    slowCache.get('slow'),
    fastCache.get('fast')
  ])

  assert.deepEqual(new Uint8Array(slowResult), Uint8Array.from([1, 2, 3]))
  assert.deepEqual(new Uint8Array(fastResult), Uint8Array.from([4, 5, 6]))
})

test('RedisICache propagates errors returned by the real dispatcher', async (t) => {
  const channelName = `redis-icache-test-${randomUUID()}`
  const { redis } = createRedisStub(undefined, new Error('Redis unavailable'))
  const dispatcher = createRedisCacheDispatcher(channelName, redis, logger)
  const cache = new RedisICache(new BroadcastChannel(channelName))
  t.after(() => {
    cache.close()
    dispatcher.close()
  })

  await assert.rejects(cache.get('key'), /Redis unavailable/)
})

test('RedisICache rejects pending operations when its IPC channel closes', async () => {
  const channelName = `redis-icache-test-${randomUUID()}`
  const cache = new RedisICache(new BroadcastChannel(channelName))
  const pendingGet = cache.get('key')

  cache.close()

  await assert.rejects(pendingGet, /Redis cache IPC channel closed/)
})
