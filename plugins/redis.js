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
