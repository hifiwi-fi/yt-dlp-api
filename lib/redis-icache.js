/**
 * @import { FastifyBaseLogger } from 'fastify'
 * @import { BroadcastChannel } from 'node:worker_threads'
 * @import { Types } from 'youtubei.js'
 */
import { randomUUID } from 'node:crypto'

/**
 * @typedef {'get' | 'set' | 'remove'} RedisCacheOperation
 * @typedef {Object} RedisCacheResponse
 * @property {'redis-cache-response'} type
 * @property {string} clientId
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

  /** @type {BroadcastChannel} */
  #channel

  /** @type {FastifyBaseLogger?} */
  #logger

  /** @type {Map<number, PendingRequest>} */
  #pendingRequests = new Map()

  #clientId = randomUUID()
  #nextRequestId = 1
  #closed = false

  /**
   * @param {BroadcastChannel} channel - Dedicated worker IPC channel
   * @param {FastifyBaseLogger} [logger] - Optional logger for warnings
   */
  constructor (channel, logger) {
    this.#channel = channel
    this.#logger = logger || null
    this.#channel.onmessage = (event) => this.#handleMessage(event.data)
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

  close () {
    if (this.#closed) return
    this.#closed = true
    this.#channel.close()
    const error = new Error('Redis cache IPC channel closed')
    for (const pendingRequest of this.#pendingRequests.values()) {
      pendingRequest.reject(error)
    }
    this.#pendingRequests.clear()
  }

  /**
   * @param {RedisCacheOperation} operation
   * @param {string} key
   * @param {ArrayBuffer} [value]
   * @returns {Promise<Uint8Array | null>}
   */
  #request (operation, key, value) {
    if (this.#closed) {
      return Promise.reject(new Error('Redis cache IPC channel closed'))
    }

    const requestId = this.#nextRequestId++
    /** @type {PendingRequest | undefined} */
    let pendingRequest
    const response = new Promise((resolve, reject) => {
      pendingRequest = { resolve, reject }
      this.#pendingRequests.set(requestId, pendingRequest)
    })

    const request = operation === 'set'
      ? {
          type: 'redis-cache-request',
          clientId: this.#clientId,
          requestId,
          operation,
          key,
          value
        }
      : {
          type: 'redis-cache-request',
          clientId: this.#clientId,
          requestId,
          operation,
          key
        }

    try {
      this.#channel.postMessage(request)
    } catch (err) {
      this.#pendingRequests.delete(requestId)
      pendingRequest?.reject(err instanceof Error ? err : new Error(String(err)))
    }

    return response
  }

  /** @param {unknown} message */
  #handleMessage (message) {
    if (!isRedisCacheResponse(message) || message.clientId !== this.#clientId) return

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
}

/**
 * @param {unknown} message
 * @returns {message is RedisCacheResponse}
 */
function isRedisCacheResponse (message) {
  if (typeof message !== 'object' || message === null) return false
  const candidate = /** @type {Record<string, unknown>} */ (message)
  return candidate.type === 'redis-cache-response' &&
    typeof candidate.clientId === 'string' &&
    typeof candidate.requestId === 'number' &&
    (candidate.value === null || candidate.value instanceof Uint8Array) &&
    (candidate.error === undefined || typeof candidate.error === 'string')
}
