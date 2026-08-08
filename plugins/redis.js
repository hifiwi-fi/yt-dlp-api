/** @import { JSONSchema } from 'json-schema-to-ts' */
import fp from 'fastify-plugin'

export const redisEnvSchema = /** @type {const} @satisfies {JSONSchema} */ ({
  properties: {
    REDIS_CACHE_URL: {
      type: 'string',
      default: 'redis://localhost:6379/1'
    }
  },
  required: []
})

/**
 * Own the Redis connection in the Fastify process rather than worker threads.
 * Workers access Redis through their owner's IPC dispatcher, so increasing the
 * worker pool size does not increase the number of Redis connections created by
 * this application process.
 */
export default fp(async function redis (fastify) {
  await fastify.register(import('@fastify/redis'), {
    url: fastify.config.REDIS_CACHE_URL,
    family: 6,
    connectTimeout: 500,
    maxRetriesPerRequest: 1
  })
}, {
  name: 'redis',
  dependencies: ['env']
})
