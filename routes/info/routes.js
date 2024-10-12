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
      preValidation: fastify.auth([fastify.basicAuth]),
      schema: {
        querystring: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
            format: { type: 'string' }
          },
          required: ['url', 'format'],
          additionalProperties: false
        }
      }
    },
    async function (request, reply) {
      const {
        url,
        format
      } = request.query

      const params = new URLSearchParams({
        url,
        format
      })

      const response = await undiciRequest(
        `http://${fastify.config.YTDLPAPI_HOST}/info?${params.toString()}`,
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
