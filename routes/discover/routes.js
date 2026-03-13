import { request as undiciRequest } from 'undici'
import { isYouTubeUrl } from '@bret/is-youtube-url'
import { ytDlpFormats } from '../yt-dlp-formats.js'

/**
* @import { FastifyPluginAsyncJsonSchemaToTs } from '@fastify/type-provider-json-schema-to-ts'
* @import { BasicInfoMetadataResults } from '../../lib/onesie/index.js'
**/

/**
 * @typedef {{
 *   filesize_approx?: number | null,
 *   duration?: number | null,
 *   channel?: string | null,
 *   uploader?: string | null,
 *   title?: string | null,
 *   ext?: string | null,
 *   _type?: string | null,
 *   description?: string | null,
 *   uploader_url?: string | null,
 *   channel_url?: string | null,
 *   thumbnail?: string | null,
 *   live_status?: string | null,
 *   release_timestamp?: number | null,
 * }} YtDlpDiscoverBody
 */

/**
 * @type {FastifyPluginAsyncJsonSchemaToTs}
*/
export default async function discoverRoute (fastify, _opts) {
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
              release_timestamp: { type: 'number', nullable: true }
            },
            additionalProperties: false
          },
          default: {
            additionalProperties: true
          }
        }
      }
    },
    async function (request, reply) {
      const {
        url,
        format
      } = request.query

      const parsedUrl = new URL(url)

      if (isYouTubeUrl(parsedUrl)) {
        try {
          const results = /** @type {BasicInfoMetadataResults} */ (await fastify.runTask({
            url: parsedUrl.toString(),
            format,
            metadataOnly: true
          }))
          return reply.status(200).send(results)
        } catch (err) {
          const handledError = err instanceof Error ? err : new Error('Unknown error', { cause: err })
          request.log.error(handledError, 'Error when running discover request for YouTube URL')
          if (handledError?.message?.includes('No matching formats found')) {
            reply.status(404)
            return reply.send({
              description: 'No matching formats found'
            })
          } else {
            reply.status(500)
            return reply.send({
              description: 'Error extracting metadata from YouTube'
            })
          }
        }
      } else {
        try {
          const params = new URLSearchParams({ url, format: ytDlpFormats[format] })
          const response = await undiciRequest(
            `http://${fastify.config.YTDLPAPI_HOST}/info?${params.toString()}`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            })

          const replyBody = /** @type {YtDlpDiscoverBody} */ (await response.body.json())

          if (response.statusCode > 399) {
            reply.status(response.statusCode)
            return replyBody
          }

          // url presence confirms a usable format was resolved — we strip it from the
          // response since discover callers must not store or use it (playback resolves
          // media URLs on demand via /unified at request time).
          if (!replyBody.url) {
            reply.status(404)
            return reply.send({ description: 'No media URL found for URL' })
          }

          const responseData = {
            filesize_approx: replyBody.filesize_approx ?? null,
            duration: replyBody.duration ?? null,
            channel: replyBody.channel ?? replyBody.uploader ?? null,
            title: replyBody.title ?? null,
            ext: replyBody.ext ?? null,
            _type: replyBody._type ?? null,
            description: replyBody.description ?? null,
            uploader_url: replyBody.uploader_url ?? null,
            channel_url: replyBody.channel_url ?? null,
            thumbnail: replyBody.thumbnail ?? null,
            live_status: replyBody.live_status ?? null,
            release_timestamp: replyBody.release_timestamp ?? null,
          }

          return reply.status(200).send(responseData)
        } catch (err) {
          fastify.log.error(new Error('Error while requesting yt-dlp info endpoint during discovery', { cause: err }))
          reply.status(500)
          return reply.send({
            description: 'Error while requesting yt-dlp info endpoint during discovery'
          })
        }
      }
    }
  )
}
