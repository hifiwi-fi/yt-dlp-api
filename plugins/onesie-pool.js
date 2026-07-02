/**
 * @import { WorkerConfig } from '../lib/onesie-worker.js'
 * @import { JSONSchema } from 'json-schema-to-ts'
 */
import fp from 'fastify-plugin'
import { resolve, join } from 'path'

export const onesiePoolEnvSchema = /** @type {const} @satisfies {JSONSchema} */ ({
  properties: {
    REDIS_CACHE_URL: {
      type: 'string',
      default: 'redis://localhost:6379/1',
    },
    TVCONFIG_REFRESH_MS: {
      type: 'number',
      default: 18_000_000
    },
    INNERTUBE_REFRESH_MS: {
      type: 'number',
      default: 172_800_000 // 48 hours in milliseconds
    },
    YOUTUBE_WEB_CLIENT_VERSION: {
      type: 'string',
      // Override the WEB client version advertised in onesie player requests.
      // Normally unset (library's current version). An operational lever if a
      // specific version starts misbehaving — but note progressive-format
      // availability is A/B-bucketed per visitor session, so a version pin
      // does not reliably restore it.
      // default: '2.20260206.01.00'
    },
    YOUTUBE_PLAYER_ID: {
      type: 'string',
      // default: '56af1322'
      // default: '8a6e7bc4'
      // default: '6c5cb4f4'
      // default: '487b9fc1'
      // default: '6c5cb4f4'
      // default: '56211dc2'
      // default: '99f55c01'
      // default: 'ecc3e9a7'
      // default: '05540cb0'
      // default: '9f4cc5e4'
    },
  },
  required: [],
})

const __dirname = import.meta.dirname

export default fp(async function onesiePool (fastify, opts) {
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

  if (fastify.config.YOUTUBE_WEB_CLIENT_VERSION != null) {
    workerData.webClientVersion = fastify.config.YOUTUBE_WEB_CLIENT_VERSION
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
    // Allow queuing — discover + unified both use this pool now
    maxQueue: 100
  })

  // Listen for log messages from workers
  fastify.piscina.on('message', (message) => {
    // Check if this is a log message
    if (message && message.type === 'log') {
      const { level, msg, data } = message
      // Use the parent's logger with the worker's log data
      fastify.log[level]({ ...data, worker: true }, msg)
    }
  })
}, {
  name: 'onesie-pool',
  dependencies: ['env']
})
