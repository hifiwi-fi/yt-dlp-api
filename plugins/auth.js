import fp from 'fastify-plugin'

/**
 * This plugins adds fastify-auth
 *
 * @see https://github.com/fastify/fastify-auth
 */
export default fp(async function (fastify, _) {
  fastify.register(import('@fastify/auth'))
}, {
  name: 'auth',
  dependencies: [],
})
