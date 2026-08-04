import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { BroadcastChannel } from 'node:worker_threads'
import { RedisICache } from './redis-icache.js'

test('RedisICache delegates binary cache operations over worker IPC', async (t) => {
  const channelName = `redis-icache-test-${randomUUID()}`
  const mainChannel = new BroadcastChannel(channelName)
  const workerChannel = new BroadcastChannel(channelName)
  const cache = new RedisICache(workerChannel)
  t.after(() => {
    cache.close()
    mainChannel.close()
  })

  /** @type {Map<string, Uint8Array>} */
  const values = new Map()
  /** @type {string[]} */
  const operations = []

  mainChannel.onmessage = (event) => {
    const message = event.data
    operations.push(`${message.operation}:${message.key}`)

    if (message.operation === 'get') {
      const delay = message.key === 'slow' ? 10 : 0
      setTimeout(() => {
        mainChannel.postMessage({
          type: 'redis-cache-response',
          clientId: message.clientId,
          requestId: message.requestId,
          value: values.get(message.key) ?? null,
          error: undefined
        })
      }, delay)
      return
    }

    if (message.operation === 'set') {
      values.set(message.key, new Uint8Array(message.value))
    } else {
      values.delete(message.key)
    }

    mainChannel.postMessage({
      type: 'redis-cache-response',
      clientId: message.clientId,
      requestId: message.requestId,
      value: null,
      error: undefined
    })
  }

  const slowValue = Uint8Array.from([1, 2, 3]).buffer
  const fastValue = Uint8Array.from([4, 5, 6]).buffer
  await cache.set('slow', slowValue)
  await cache.set('fast', fastValue)

  const [slowResult, fastResult] = await Promise.all([
    cache.get('slow'),
    cache.get('fast')
  ])

  assert.deepEqual(new Uint8Array(slowResult), new Uint8Array(slowValue))
  assert.deepEqual(new Uint8Array(fastResult), new Uint8Array(fastValue))

  await cache.remove('fast')
  assert.equal(await cache.get('fast'), undefined)
  assert.deepEqual(operations, [
    'set:slow',
    'set:fast',
    'get:slow',
    'get:fast',
    'remove:fast',
    'get:fast'
  ])
})

test('RedisICache propagates Redis errors from the main thread', async (t) => {
  const channelName = `redis-icache-test-${randomUUID()}`
  const mainChannel = new BroadcastChannel(channelName)
  const workerChannel = new BroadcastChannel(channelName)
  const cache = new RedisICache(workerChannel)
  t.after(() => {
    cache.close()
    mainChannel.close()
  })

  mainChannel.onmessage = (event) => {
    const message = event.data
    mainChannel.postMessage({
      type: 'redis-cache-response',
      clientId: message.clientId,
      requestId: message.requestId,
      value: null,
      error: 'Redis unavailable'
    })
  }

  await assert.rejects(cache.get('key'), /Redis unavailable/)
})
