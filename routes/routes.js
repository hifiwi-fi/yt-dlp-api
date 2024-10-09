/**
* @import { FastifyPluginAsyncJsonSchemaToTs } from '@bret/type-provider-json-schema-to-ts'
**/

/**
 * @type {FastifyPluginAsyncJsonSchemaToTs}
*/
export default async function rootRoute (fastify, _opts) {
  fastify.get(
    '/',
    {},
    async function (_request, _reply) {
      return {
        hello: 'world',
        name: 'yt-dlp-api',
        version: fastify.pkg.version,
      }
    }
  )
}
