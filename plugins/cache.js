import fp from 'fastify-plugin'
// @ts-expect-error - No type definitions available for abstract-cache-redis
import abstractCacheRedis from 'abstract-cache-redis'

/**
 * This plugins adds fastify/fastify-caching
 *
 * @see https://github.com/fastify/fastify-caching
 */
export default fp(async function (fastify, _) {
  const cache = abstractCacheRedis({
    client: fastify.redis['cache'],
  })

  fastify.decorate('cache', cache)
}, {
  name: 'cache',
  dependencies: ['redis'],
})
