/**
* @import { FastifyPluginAsyncJsonSchemaToTs } from '@fastify/type-provider-json-schema-to-ts'
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

      const response = await fastify.pythonServer.info({ url, format })
      return reply.status(response.statusCode).send(response.body)
    }
  )
}
