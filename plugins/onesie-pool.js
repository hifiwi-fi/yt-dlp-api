/**
 * @import { WorkerConfig } from '../lib/onesie-worker.js'
 */
import fp from 'fastify-plugin'
import { resolve, join } from 'path'

const __dirname = import.meta.dirname

export default fp(async function onesiePool (fastify, _opts) {
  const workerPath = resolve(join(__dirname, '..', 'lib', 'onesie-worker.js'))

  /**
   * @type {WorkerConfig}
   */
  const workerData = {
    redisUrl: fastify.config.REDIS_CACHE_URL,
    redisOptions: {
      family: 6,
      connectTimeout: 500,
      maxRetriesPerRequest: 1,
    },
    innertubeRefreshMs: fastify.config.INNERTUBE_REFRESH_MS,
    tvConfigRefreshMs: fastify.config.TVCONFIG_REFRESH_MS
  }

  // Only add playerId if it's explicitly provided and not null/undefined
  if (fastify.config.YOUTUBE_PLAYER_ID != null) {
    workerData.playerId = fastify.config.YOUTUBE_PLAYER_ID
  }

  await fastify.register(import('@piscina/fastify'), {
    filename: workerPath,
    workerData,
    // Pool tuning for single worker instance
    minThreads: 1,
    maxThreads: 1,
    // Keep the worker alive indefinitely
    idleTimeout: Infinity,
    // Process one task at a time to ensure serialization
    concurrentTasksPerWorker: 1,
    // Queue configuration
    maxQueue: 'auto'
  })
}, {
  name: 'onesie-pool',
  dependencies: ['env']
})
