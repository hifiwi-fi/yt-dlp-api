/**
 * @import { FastifyBaseLogger } from 'fastify'
 * @import { MessagePort } from 'node:worker_threads'
 * @import { Types } from 'youtubei.js'
 */

/**
 * @typedef {'get' | 'set' | 'remove'} RedisCacheOperation
 * @typedef {Object} RedisCacheResponse
 * @property {'redis-cache-response'} type
 * @property {number} requestId
 * @property {Uint8Array | null} value
 * @property {string | undefined} error
 * @typedef {Object} PendingRequest
 * @property {(value: Uint8Array | null) => void} resolve
 * @property {(error: Error) => void} reject
 */

/**
 * RedisICache implements the ICache interface required by youtubei.js while
 * delegating Redis operations to the main thread over worker IPC.
 * @implements {Types.ICache}
 */
export class RedisICache {
  /** @type {string} */
  cache_dir = 'redis'

  /** @type {MessagePort} */
  #port

  /** @type {FastifyBaseLogger?} */
  #logger

  /** @type {Map<number, PendingRequest>} */
  #pendingRequests = new Map()

  #nextRequestId = 1

  /**
   * @param {MessagePort} port - Worker IPC port connected to the main thread
   * @param {FastifyBaseLogger} [logger] - Optional logger for warnings
   */
  constructor (port, logger) {
    this.#port = port
    this.#logger = logger || null
    this.#port.on('message', this.#handleMessage)
    this.#port.on('close', this.#handleClose)
  }

  /**
   * Get cached data as ArrayBuffer.
   * @param {string} key - Cache key
   * @returns {Promise<ArrayBuffer | undefined>}
   */
  async get (key) {
    const value = await this.#request('get', key)
    if (value === null) return undefined
    return new Uint8Array(value).buffer
  }

  /**
   * Set cached data from ArrayBuffer.
   * @param {string} key - Cache key
   * @param {ArrayBuffer} value - Data to cache
   * @returns {Promise<void>}
   */
  async set (key, value) {
    await this.#request('set', key, value)
  }

  /**
   * Remove cached data.
   * @param {string} key - Cache key
   * @returns {Promise<void>}
   */
  async remove (key) {
    await this.#request('remove', key)
  }

  /**
   * @param {RedisCacheOperation} operation
   * @param {string} key
   * @param {ArrayBuffer} [value]
   * @returns {Promise<Uint8Array | null>}
   */
  #request (operation, key, value) {
    const requestId = this.#nextRequestId++
    const response = new Promise((resolve, reject) => {
      this.#pendingRequests.set(requestId, { resolve, reject })
    })

    if (operation === 'set') {
      this.#port.postMessage({
        type: 'redis-cache-request',
        requestId,
        operation,
        key,
        value
      })
    } else {
      this.#port.postMessage({
        type: 'redis-cache-request',
        requestId,
        operation,
        key
      })
    }

    return response
  }

  /** @param {unknown} message */
  #handleMessage = (message) => {
    if (!isRedisCacheResponse(message)) return

    const pendingRequest = this.#pendingRequests.get(message.requestId)
    if (!pendingRequest) {
      this.#logger?.warn({ requestId: message.requestId }, 'Received response for unknown Redis cache request')
      return
    }

    this.#pendingRequests.delete(message.requestId)
    if (message.error !== undefined) {
      pendingRequest.reject(new Error(message.error))
      return
    }

    pendingRequest.resolve(message.value)
  }

  #handleClose = () => {
    const error = new Error('Redis cache IPC channel closed')
    for (const pendingRequest of this.#pendingRequests.values()) {
      pendingRequest.reject(error)
    }
    this.#pendingRequests.clear()
  }
}

/**
 * @param {unknown} message
 * @returns {message is RedisCacheResponse}
 */
function isRedisCacheResponse (message) {
  if (typeof message !== 'object' || message === null) return false
  const candidate = /** @type {Record<string, unknown>} */ (message)
  return candidate.type === 'redis-cache-response' &&
    typeof candidate.requestId === 'number' &&
    (candidate.value === null || candidate.value instanceof Uint8Array) &&
    (candidate.error === undefined || typeof candidate.error === 'string')
}
