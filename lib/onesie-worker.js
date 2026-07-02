import { Redis } from 'ioredis'
import { parentPort, workerData } from 'worker_threads'
import { onesieFormatRequest, getBasicInfoMetadata, SabrOnlySessionError } from './onesie/index.js'
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
 * @property {string} [webClientVersion] - WEB client version to advertise in player requests (see YOUTUBE_WEB_CLIENT_VERSION)
 */

/**
 * @typedef {Object} OnesieRequest
 * @property {string} url - The URL to process
 * @property {OnesieFormat} format - The format to request
 * @property {boolean} [returnRedirectUrl] - Whether to return redirect URL (unified path)
 * @property {boolean} [metadataOnly] - Return metadata only, no URL decipher (discover path)
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
  // Fetches the InnerTube config (configInfo hashes) during session setup,
  // matching the library default and what upstream tests against. Note:
  // YouTube A/B-withholds progressive (video+audio) formats per visitor
  // session; neither this nor YOUTUBE_WEB_CLIENT_VERSION reliably avoids
  // a bad bucket, and the Redis session cache keeps a bucket sticky.
  retrieve_innertube_config: true
}

if (config.playerId) {
  innerTubeOpts.player_id = config.playerId
}

// youtubei.js caches the whole session (visitor id + config state) under this
// key via the cache passed to Innertube.create, so a working session persists
// across worker restarts and test runs.
const INNERTUBE_SESSION_CACHE_KEY = 'innertube_session_data'

async function createInnertube () {
  const instance = await Innertube.create(innerTubeOpts)
  if (config.webClientVersion) {
    instance.session.context.client.clientVersion = config.webClientVersion
  }
  return instance
}

logger.debug({ playerId: config.playerId }, 'Creating Innertube instance')
let innertube = await createInnertube()
logger.debug({ webClientVersion: config.webClientVersion }, 'Innertube instance created')

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
    const { url, format, returnRedirectUrl = true, metadataOnly = false } = /** @type {OnesieRequest} */ (taskData)

    logger.debug({ url, format, returnRedirectUrl, metadataOnly }, 'Processing onesie request')

    if (!url || !format) {
      const error = new Error('Worker requires url and format parameters')
      logger.error({ url, format }, 'Invalid task parameters')
      throw error
    }

    // A session bucketed into SABR-only streaming stays that way (and is
    // cached in Redis), so on detection: drop the cached session, recreate
    // Innertube with a fresh visitor id, and retry. Good sessions re-cache
    // automatically, so re-rolls only happen when a session goes bad.
    const maxSessionRerolls = 2
    for (let attempt = 0; ; attempt++) {
      try {
        let result
        if (metadataOnly) {
          result = await getBasicInfoMetadata(url, format, innertube, tvConfig, logger)
        } else {
          result = await onesieFormatRequest(url, format, innertube, tvConfig, returnRedirectUrl, logger)
        }

        logger.debug({ url, format, metadataOnly, hasResult: !!result }, 'Onesie request completed')
        return result
      } catch (err) {
        if (err instanceof SabrOnlySessionError) {
          // Drop the bad session even when giving up, so the next request
          // starts from a fresh visitor roll instead of a known-bad one.
          await innertubeCache.remove(INNERTUBE_SESSION_CACHE_KEY)
          innertube = await createInnertube()
          if (attempt < maxSessionRerolls) {
            logger.warn({ url, attempt: attempt + 1, maxSessionRerolls }, 'SABR-only session detected — re-rolling Innertube visitor session')
            continue
          }
        }
        logger.error({ err, url, format, metadataOnly }, 'Onesie request failed')
        throw err
      }
    }
  }

  // Return the actual worker function that will handle requests
  return handleOnsieRequest
}

// Export the initialization promise
// Piscina will wait for this before marking the worker as ready
export default initialize()
