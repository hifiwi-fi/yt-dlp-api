import { request as undiciRequest } from 'undici'

/**
* @import { FastifyPluginAsyncJsonSchemaToTs } from '@bret/type-provider-json-schema-to-ts'
**/

/**
 * @type {FastifyPluginAsyncJsonSchemaToTs}
*/
export default async function ytDlpRoute (fastify, _opts) {
  fastify.get(
    '/',
    {
      preHandler: fastify.auth([fastify.basicAuth]),
      schema: {
        querystring: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false
        }
      }
    },
    async function (_request, reply) {
      const response = await undiciRequest(
        `http://${fastify.config.YTDLPAPI_HOST}/ytdlp`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

      reply.status(response.statusCode)

      return await response.body.text()
    }
  )
}
