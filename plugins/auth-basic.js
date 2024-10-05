import fp from 'fastify-plugin'

/**
 * This plugins adds fastify-auth
 *
 * @see https://github.com/fastify/fastify-auth
 */
export default fp(async function (fastify, _) {
  fastify.register(import('@fastify/basic-auth'), {
    async validate (username, password, _request, _reply) {
      if (!username) throw new Error('Missing username')
      if (!password) throw new Error('Missing password')
      if (
        (username !== fastify.config.BASIC_AUTH_USERNAME) ||
        (password !== fastify.config.BASIC_AUTH_PASSWORD)
      ) {
        throw new Error('Unauthorized basic auth')
      }
    },
    authenticate: true,
  })
}, {
  name: 'auth-basic',
  dependencies: ['env'],
})
