import fp from 'fastify-plugin'

import { onesieFormatRequest } from '../lib/onesie/index.js'
import { YouTubeTVClientConfig } from '../lib/onesie/tv-config.js'
import { InnertubeConfig } from '../lib/onesie/innertube-config.js'
import assert from 'node:assert'

/**
 * @import { Types } from 'youtubei.js'
 * @import { Redis } from 'ioredis'
 * @import { FastifyBaseLogger } from 'fastify'
 */

/**
 * RedisICache implements the ICache interface required by youtubei.js
 * using Redis as the backing store with native binary data support
 * @implements {Types.ICache}
 */
class RedisICache {
  /** @type {string} */
  cache_dir = 'redis'

  /** @type {Redis} */
  #redisClient

  /** @type {number} */
  #ttlSeconds = 48 * 60 * 60 // 2 days

  /** @type {FastifyBaseLogger?} */
  #logger

  /**
   * @param {Redis} redisClient - The ioredis client instance
   * @param {FastifyBaseLogger} [logger] - Optional logger for warnings
   */
  constructor (redisClient, logger) {
    this.#redisClient = redisClient
    this.#logger = logger || null
  }

  /**
   * Get cached data as ArrayBuffer
   * @param {string} key - Cache key
   * @returns {Promise<ArrayBuffer | undefined>}
   */
  async get (key) {
    if (this.#redisClient.status !== 'ready') {
      this.#logger?.warn({ redisStatus: this.#redisClient.status, key }, 'Redis cache get operation skipped - connection not ready')
      return undefined
    }
    const buffer = await this.#redisClient.getBuffer(key)
    if (buffer === null) {
      return undefined
    }
    // Convert Buffer to ArrayBuffer
    return new Uint8Array(buffer).buffer
  }

  /**
   * Set cached data from ArrayBuffer
   * @param {string} key - Cache key
   * @param {ArrayBuffer} value - Data to cache
   * @returns {Promise<void>}
   */
  async set (key, value) {
    if (this.#redisClient.status !== 'ready') {
      this.#logger?.warn({ redisStatus: this.#redisClient.status, key }, 'Redis cache set operation skipped - connection not ready')
      return
    }
    // Convert ArrayBuffer to Buffer
    const buffer = Buffer.from(value)
    // Use setex for TTL support
    await this.#redisClient.setex(key, this.#ttlSeconds, buffer)
  }

  /**
   * Remove cached data
   * @param {string} key - Cache key
   * @returns {Promise<void>}
   */
  async remove (key) {
    if (this.#redisClient.status !== 'ready') {
      this.#logger?.warn({ redisStatus: this.#redisClient.status, key }, 'Redis cache remove operation skipped - connection not ready')
      return
    }
    await this.#redisClient.del(key)
  }
}

export default fp(async function (fastify, _) {
  const redisCache = fastify.redis['cache']
  assert(redisCache)
  const innertubeCache = new RedisICache(redisCache, fastify.log)

  const youtubei = {
    innertubeConfig: new InnertubeConfig({
      refreshMs: fastify.config.INNERTUBE_REFRESH_MS,
      logger: fastify.log,
      cache: innertubeCache
    }),
    tvConfig: new YouTubeTVClientConfig({
      refreshMs: fastify.config.TVCONFIG_REFRESH_MS,
      logger: fastify.log
    }),
    onesieFormatRequest
  }

  fastify.decorate('youtubei', youtubei)
}, {
  name: 'youtubei',
  dependencies: ['env', 'redis'],
})
