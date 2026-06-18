import { request as undiciRequest } from 'undici'
import { isYouTubeUrl } from '@bret/is-youtube-url'
import { ytDlpFormats } from '../yt-dlp-formats.js'

/**
* @import { FastifyPluginAsyncJsonSchemaToTs } from '@fastify/type-provider-json-schema-to-ts'
* @import { OnesieFormatResults } from '../../lib/onesie/index.js'
* @import { ExtractKnownResponseType } from '../../types/fastify-utils.ts'
**/

/**
 * @typedef {{
 *   url?: string | null,
 *   filesize_approx?: number | null,
 *   duration?: number | null,
 *   channel?: string | null,
 *   title?: string | null,
 *   ext?: string | null,
 *   _type?: string | null,
 *   description?: string | null,
 *   uploader_url?: string | null,
 *   channel_url?: string | null,
 *   thumbnail?: string | null,
 *   live_status?: string | null,
 *   release_timestamp?: number | null,
 * }} YtDlpInfoBody
 */

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
            format: { type: 'string', enum: ['audio', 'video'] }
          },
          required: ['url', 'format'],
          additionalProperties: false
        },
        response: {
          200: {
            type: 'object',
            properties: {
              url: { type: 'string', format: 'uri' },
              filesize_approx: { type: 'number', nullable: true },
              duration: { type: 'number', nullable: true },
              channel: { type: 'string', nullable: true },
              title: { type: 'string', nullable: true },
              ext: { type: 'string', nullable: true },
              _type: { type: 'string', nullable: true },
              description: { type: 'string', nullable: true },
              uploader_url: { type: 'string', format: 'uri', nullable: true },
              channel_url: { type: 'string', format: 'uri', nullable: true },
              thumbnail: { type: 'string', format: 'uri', nullable: true },
              live_status: { type: 'string', nullable: true },
              release_timestamp: { type: 'number', nullable: true } // Unix timestamp in seconds (matching yt-dlp format)
            },
            oneOf: [
              { type: 'object', required: ['url'] },
              { type: 'object', required: ['live_status', 'release_timestamp'] },
            ],
            additionalProperties: true
          },
          default: {
            additionalProperties: true
          }
        }
      }
    },
    async function (request, reply) {
      /** @typedef {ExtractKnownResponseType<typeof reply.code<200>>} ReturnBody */

      const {
        url,
        format
      } = request.query

      const parsedUrl = new URL(url)

      if (isYouTubeUrl(parsedUrl)) {
        try {
          const results = /** @type {OnesieFormatResults} */ (await fastify.runTask({
            url: parsedUrl.toString(),
            format,
            returnRedirectUrl: true
          }))
          return reply.status(200).send(results)
        } catch (err) {
          const handledError = err instanceof Error ? err : new Error('Unknown error', { cause: err })
          request.log.error(handledError, 'Error when running onesie request')
          if (handledError?.message?.includes('No matching formats found')) {
            reply.status(404)
            return reply.send({
              description: 'No matching formats found'
            })
          } else {
            reply.status(500)
            return reply.send({
              description: 'Error extracting data from YouTube'
            })
          }
        }
      } else {
        try {
          const params = new URLSearchParams({
            url,
            format: ytDlpFormats[format]
          })
          const response = await undiciRequest(
            `http://${fastify.config.YTDLPAPI_HOST}/info?${params.toString()}`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            })

          const replyBody = /** @type {YtDlpInfoBody} */ (await response.body.json())

          if (response.statusCode > 399) {
            reply.status(response.statusCode)
            return replyBody
          }

          /** @type {ReturnBody} */
          const responseData = {
            url: replyBody.url,
            filesize_approx: replyBody.filesize_approx,
            duration: replyBody.duration,
            channel: replyBody.channel,
            title: replyBody.title,
            ext: replyBody.ext,
            _type: replyBody._type,
            description: replyBody.description,
            uploader_url: replyBody.uploader_url,
            channel_url: replyBody.channel_url,
            thumbnail: replyBody.thumbnail,
            live_status: replyBody.live_status,
            release_timestamp: replyBody.release_timestamp,
          }

          return reply.code(200).send(responseData)
        } catch (err) {
          fastify.log.error(new Error('Error while requesting yt-dlp endpoint data', { cause: err }))
          reply.status(500)
          return reply.send({
            description: 'Error while requesting yt-dlp endpoint'
          })
        }
      }
    }
  )
}
