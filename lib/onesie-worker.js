import { Redis } from 'ioredis'
import { parentPort, workerData } from 'worker_threads'
import { onesieFormatRequest } from './onesie/index.js'
import { YouTubeTVClientConfig } from './onesie/tv-config.js'
import Innertube from 'youtubei.js'
import { RedisICache } from './redis-icache.js'
import assert from 'node:assert'
import { createWorkerLogger } from './worker-logger.js'

/**
 * @import { RedisOptions } from 'ioredis'
 * @import { Types } from 'youtubei.js'
 * @import { OnesieFormat } from './onesie/types.js'
 */

/**
 * @typedef {Object} WorkerConfig
 * @property {string} redisUrl - Redis configuration
 * @property {RedisOptions} redisOptions - Redis configuration options
 * @property {number} innertubeRefreshMs - Refresh interval for InnertubeConfig
 * @property {number} tvConfigRefreshMs - Refresh interval for TVConfig
 * @property {string} [playerId] - Specific player ID to use (e.g., '0004de42')
 */

/**
 * @typedef {Object} OnesieRequest
 * @property {string} url - The URL to process
 * @property {OnesieFormat} format - The format to request
 * @property {boolean} [returnRedirectUrl] - Whether to return redirect URL
 */

// Get worker data passed from main thread
const config = /** @type {WorkerConfig} */ (workerData)

// Create logger that sends messages to parent
const logger = createWorkerLogger()

logger.debug({ config: { redisUrl: config.redisUrl, innertubeRefreshMs: config.innertubeRefreshMs, tvConfigRefreshMs: config.tvConfigRefreshMs } }, 'Worker initializing with config')

assert(config.redisUrl, 'Worker requires redisUrl in workerData')
assert(config.innertubeRefreshMs, 'innertubeRefreshMs is set')
assert(config.tvConfigRefreshMs, 'tvConfigRefreshMs is set')

// Create Redis connection
logger.debug({ redisUrl: config.redisUrl }, 'Connecting to Redis')
const redis = new Redis(config.redisUrl, config.redisOptions)

// Wait for connection to be ready
await new Promise((resolve, reject) => {
  redis.once('ready', () => {
    logger.debug('Redis connection ready')
    resolve()
  })
  redis.once('error', (err) => {
    logger.error({ err }, 'Redis connection error')
    reject(err)
  })
})

logger.debug('Creating Innertube cache with Redis')
const innertubeCache = new RedisICache(redis, logger)

/**
 * @type{ Types.InnerTubeConfig }
 */
const innerTubeOpts = {
  cache: innertubeCache,
  retrieve_innertube_config: false
}

if (config.playerId) {
  innerTubeOpts.player_id = config.playerId
}

logger.debug({ playerId: config.playerId }, 'Creating Innertube instance')
const innertube = await Innertube.create(innerTubeOpts)
logger.debug('Innertube instance created')

logger.debug({ refreshMs: config.tvConfigRefreshMs }, 'Creating YouTube TV config')
const tvConfig = new YouTubeTVClientConfig({
  refreshMs: config.tvConfigRefreshMs,
  logger
})

// Log initialization complete
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

// Initialize function that sets up persistent resources
async function initialize () {
  /**
   *
   * @param {OnesieRequest} taskData
   */
  const handleOnsieRequest = async (taskData) => {
    const { url, format, returnRedirectUrl = true } = /** @type {OnesieRequest} */ (taskData)

    logger.debug({ url, format, returnRedirectUrl }, 'Processing onesie request')

    if (!url || !format) {
      const error = new Error('Worker requires url and format parameters')
      logger.error({ url, format }, 'Invalid task parameters')
      throw error
    }

    try {
      // Call onesieFormatRequest with the persistent config instances
      const result = await onesieFormatRequest(
        url,
        format,
        innertube,
        tvConfig,
        returnRedirectUrl
      )

      logger.debug({ url, format, hasResult: !!result }, 'Onesie request completed')
      return result
    } catch (err) {
      logger.error({ err, url, format }, 'Onesie request failed')
      throw err
    }
  }

  // Return the actual worker function that will handle requests
  return handleOnsieRequest
}

// Export the initialization promise
// Piscina will wait for this before marking the worker as ready
export default initialize()
