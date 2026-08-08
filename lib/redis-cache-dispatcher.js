/**
 * @import { FastifyBaseLogger, FastifyInstance } from 'fastify'
 * @import { BroadcastChannel } from 'node:worker_threads'
 */
import { BroadcastChannel as NodeBroadcastChannel } from 'node:worker_threads'

/**
 * @typedef {Object} RedisCacheRequest
 * @property {'redis-cache-request'} type
 * @property {string} clientId
 * @property {number} requestId
 * @property {'get' | 'set' | 'remove'} operation
 * @property {string} key
 * @property {ArrayBuffer | undefined} value
 */

const ttlSeconds = 48 * 60 * 60

/**
 * Create the main-thread Redis dispatcher on a dedicated worker IPC channel.
 *
 * The Fastify process is the resource owner and brokers external Redis access
 * for every worker through one shared client connection. The dedicated channel
 * keeps application IPC separate from Piscina's control channel. Responses are
 * broadcast, so client and request IDs let each worker accept only its result.
 *
 * @param {string} channelName
 * @param {FastifyInstance['redis']} redis
 * @param {FastifyBaseLogger} logger
 * @returns {BroadcastChannel}
 */
export function createRedisCacheDispatcher (channelName, redis, logger) {
  const channel = new NodeBroadcastChannel(channelName)
  channel.onmessage = (event) => {
    const message = event.data
    if (!isRedisCacheRequest(message)) return

    handleRedisCacheRequest(channel, redis, logger, message).catch((err) => {
      logger.error({ err, requestId: message.requestId }, 'Redis cache IPC dispatcher failed')
    })
  }
  return channel
}

/**
 * @param {BroadcastChannel} channel
 * @param {FastifyInstance['redis']} redis
 * @param {FastifyBaseLogger} logger
 * @param {RedisCacheRequest} request
 */
async function handleRedisCacheRequest (channel, redis, logger, request) {
  try {
    if (request.operation === 'get') {
      const value = await redis.getBuffer(request.key)
      channel.postMessage({
        type: 'redis-cache-response',
        clientId: request.clientId,
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

    channel.postMessage({
      type: 'redis-cache-response',
      clientId: request.clientId,
      requestId: request.requestId,
      value: null,
      error: undefined
    })
  } catch (err) {
    const error = /** @type {Error} */ (err)
    logger.warn({ err: error, operation: request.operation, key: request.key }, 'Redis cache operation failed')
    channel.postMessage({
      type: 'redis-cache-response',
      clientId: request.clientId,
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
    typeof candidate.clientId === 'string' &&
    typeof candidate.requestId === 'number' &&
    (candidate.operation === 'get' || candidate.operation === 'set' || candidate.operation === 'remove') &&
    typeof candidate.key === 'string' &&
    (candidate.value === undefined || candidate.value instanceof ArrayBuffer)
}
