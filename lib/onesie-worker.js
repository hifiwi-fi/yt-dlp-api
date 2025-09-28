import { Redis } from 'ioredis'
import { parentPort, workerData } from 'worker_threads'
import { onesieFormatRequest } from './onesie/index.js'
import { YouTubeTVClientConfig } from './onesie/tv-config.js'
import { InnertubeConfig } from './onesie/innertube-config.js'
import { RedisICache } from './redis-icache.js'
import assert from 'node:assert'
import { pino } from 'pino'

/**
 * @typedef {Object} WorkerConfig
 * @property {string} redisUrl - Redis configuration
 * @property {number} innertubeRefreshMs - Refresh interval for InnertubeConfig
 * @property {number} tvConfigRefreshMs - Refresh interval for TVConfig
 * @property {string} [playerId] - Specific player ID to use (e.g., '0004de42')
 */

/**
 * @typedef {Object} OnesieRequest
 * @property {string} url - The URL to process
 * @property {'audio' | 'video'} format - The format to request
 * @property {boolean} [returnRedirectUrl] - Whether to return redirect URL
 */

// Initialize function that sets up persistent resources
async function initialize () {
  const logger = pino()
  // Get worker data passed from main thread
  const config = /** @type {WorkerConfig} */ (workerData)

  assert(config.redisUrl, 'Worker requires redisUrl in workerData')
  assert(config.innertubeRefreshMs, 'innertubeRefreshMs is set')
  assert(config.tvConfigRefreshMs, 'tvConfigRefreshMs is set')

  // Create Redis connection
  const redis = new Redis(config.redisUrl)

  // Wait for connection to be ready
  await new Promise((resolve, reject) => {
    redis.once('ready', resolve)
    redis.once('error', reject)
  })

  // Create cache instance
  const innertubeCache = new RedisICache(redis, logger)

  // Create InnertubeConfig and YouTubeTVClientConfig instances
  const innertubeConfigOptions = {
    refreshMs: config.innertubeRefreshMs,
    logger,
    cache: innertubeCache,
    playerId: config.playerId
  }

  const innertubeConfig = new InnertubeConfig(innertubeConfigOptions)

  const tvConfig = new YouTubeTVClientConfig({
    refreshMs: config.tvConfigRefreshMs,
    logger
  })

  // Log initialization
  logger.info('Onesie worker initialized with Redis connection')

  // Listen for termination to clean up
  parentPort?.on('close', async () => {
    try {
      logger.info('Onesie worker shutting down, closing Redis connection')
      await redis.quit()
    } catch (err) {
      logger.error({ err }, 'Error closing Redis connection in worker')
    } finally {
      logger.flush()
    }
  })

  /**
   *
   * @param {OnesieRequest} taskData
   */
  const handleOnsieRequest = async (taskData) => {
    const { url, format, returnRedirectUrl = true } = /** @type {OnesieRequest} */ (taskData)

    if (!url || !format) {
      throw new Error('Worker requires url and format parameters')
    }

    // Call onesieFormatRequest with the persistent config instances
    const result = await onesieFormatRequest(
      url,
      format,
      innertubeConfig,
      tvConfig,
      returnRedirectUrl
    )

    return result
  }

  // Return the actual worker function that will handle requests
  return handleOnsieRequest
}

// Export the initialization promise
// Piscina will wait for this before marking the worker as ready
export default initialize()
