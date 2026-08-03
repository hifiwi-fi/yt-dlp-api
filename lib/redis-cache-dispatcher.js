/**
 * @import { FastifyBaseLogger, FastifyInstance } from 'fastify'
 * @import { Worker } from 'node:worker_threads'
 */

/**
 * @typedef {Object} RedisCacheRequest
 * @property {'redis-cache-request'} type
 * @property {number} requestId
 * @property {'get' | 'set' | 'remove'} operation
 * @property {string} key
 * @property {ArrayBuffer | undefined} value
 */

const ttlSeconds = 48 * 60 * 60

/**
 * Attach the main-thread Redis dispatcher to every worker in a Piscina pool.
 * @param {FastifyInstance['piscina']} piscina
 * @param {FastifyInstance['redis']} redis
 * @param {FastifyBaseLogger} logger
 */
export function attachRedisCacheDispatcher (piscina, redis, logger) {
  piscina.on('message', (message) => {
    if (!isRedisCacheRequest(message)) return

    // This pool is deliberately fixed at one worker so the message source is
    // always the sole current thread, including during worker initialization.
    const worker = piscina.threads[0]
    if (!worker) {
      logger.error({ requestId: message.requestId }, 'Redis cache request has no worker to receive its response')
      return
    }

    handleRedisCacheRequest(worker, redis, logger, message).catch((err) => {
      logger.error({ err, requestId: message.requestId }, 'Redis cache IPC dispatcher failed')
    })
  })
}

/**
 * @param {Worker} worker
 * @param {FastifyInstance['redis']} redis
 * @param {FastifyBaseLogger} logger
 * @param {RedisCacheRequest} request
 */
async function handleRedisCacheRequest (worker, redis, logger, request) {
  try {
    if (request.operation === 'get') {
      const value = await redis.getBuffer(request.key)
      worker.postMessage({
        type: 'redis-cache-response',
        requestId: request.requestId,
        value,
        error: undefined
      })
      return
    }

    if (request.operation === 'set') {
      if (request.value === undefined) {
        throw new Error('Redis cache set request is missing a value')
      }
      await redis.setex(request.key, ttlSeconds, Buffer.from(request.value))
    } else {
      await redis.del(request.key)
    }

    worker.postMessage({
      type: 'redis-cache-response',
      requestId: request.requestId,
      value: null,
      error: undefined
    })
  } catch (err) {
    const error = /** @type {Error} */ (err)
    logger.warn({ err: error, operation: request.operation, key: request.key }, 'Redis cache operation failed')
    worker.postMessage({
      type: 'redis-cache-response',
      requestId: request.requestId,
      value: null,
      error: error.message
    })
  }
}

/**
 * @param {unknown} message
 * @returns {message is RedisCacheRequest}
 */
function isRedisCacheRequest (message) {
  if (typeof message !== 'object' || message === null) return false
  const candidate = /** @type {Record<string, unknown>} */ (message)
  return candidate.type === 'redis-cache-request' &&
    typeof candidate.requestId === 'number' &&
    (candidate.operation === 'get' || candidate.operation === 'set' || candidate.operation === 'remove') &&
    typeof candidate.key === 'string' &&
    (candidate.value === undefined || candidate.value instanceof ArrayBuffer)
}
