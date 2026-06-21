/**
 * @import { JSONSchema } from 'json-schema-to-ts'
 */
import fp from 'fastify-plugin'

export const authBasicEnvSchema = /** @type {const} @satisfies {JSONSchema} */ ({
  properties: {
    BASIC_AUTH_USERNAME: {
      type: 'string',
      default: 'user'
    },
    BASIC_AUTH_PASSWORD: {
      type: 'string',
      default: 'pass'
    },
  },
  required: [],
})

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
