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
      const response = await fastify.pythonServer.ytdlp()
      return reply.status(response.statusCode).send(response.body)
    }
  )
}
