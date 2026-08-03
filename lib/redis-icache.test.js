import assert from 'node:assert/strict'
import test from 'node:test'
import { MessageChannel } from 'node:worker_threads'
import { RedisICache } from './redis-icache.js'

test('RedisICache delegates binary cache operations over worker IPC', async (t) => {
  const { port1: mainPort, port2: workerPort } = new MessageChannel()
  t.after(() => {
    mainPort.close()
    workerPort.close()
  })

  /** @type {Map<string, Uint8Array>} */
  const values = new Map()
  /** @type {string[]} */
  const operations = []

  mainPort.on('message', (message) => {
    operations.push(`${message.operation}:${message.key}`)

    if (message.operation === 'get') {
      const delay = message.key === 'slow' ? 10 : 0
      setTimeout(() => {
        mainPort.postMessage({
          type: 'redis-cache-response',
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

    mainPort.postMessage({
      type: 'redis-cache-response',
      requestId: message.requestId,
      value: null,
      error: undefined
    })
  })

  const cache = new RedisICache(workerPort)
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
  const { port1: mainPort, port2: workerPort } = new MessageChannel()
  t.after(() => {
    mainPort.close()
    workerPort.close()
  })

  mainPort.once('message', (message) => {
    mainPort.postMessage({
      type: 'redis-cache-response',
      requestId: message.requestId,
      value: null,
      error: 'Redis unavailable'
    })
  })

  const cache = new RedisICache(workerPort)
  await assert.rejects(cache.get('key'), /Redis unavailable/)
})
