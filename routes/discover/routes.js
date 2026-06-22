import { request as undiciRequest } from 'undici'
import { isYouTubeUrl } from '@bret/is-youtube-url'
import { getYouTubeExtractionErrorResponse } from '../unified/routes.js'
import { ytDlpFormats } from '../yt-dlp-formats.js'

/**
* @import { FastifyPluginAsyncJsonSchemaToTs } from '@fastify/type-provider-json-schema-to-ts'
* @import { JSONSchema } from 'json-schema-to-ts'
* @import { BasicInfoMetadataResults } from '#lib/onesie/index.js'
* @import { ExtractKnownResponseType } from '#types/fastify-utils.js'
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

const youtubeExtractionErrorSchema = /** @type {const} @satisfies {JSONSchema} */ ({
  type: 'object',
  required: ['code', 'description'],
  properties: {
    code: { type: 'string' },
    description: { type: 'string' }
  },
  additionalProperties: false
})

const internalErrorSchema = /** @type {const} @satisfies {JSONSchema} */ ({
  type: 'object',
  required: ['description'],
  properties: {
    description: { type: 'string' }
  },
  additionalProperties: false
})

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
            additionalProperties: true
          },
          404: youtubeExtractionErrorSchema,
          424: youtubeExtractionErrorSchema,
          500: internalErrorSchema,
          503: youtubeExtractionErrorSchema,
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
          const results = /** @type {BasicInfoMetadataResults} */ (await fastify.runTask({
            url: parsedUrl.toString(),
            format,
            metadataOnly: true
          }))
          return reply.status(200).send(results)
        } catch (err) {
          const handledError = err instanceof Error ? err : new Error('Unknown error', { cause: err })
          const extractionError = getYouTubeExtractionErrorResponse(handledError)

          request.log.warn({
            err: handledError,
            url: parsedUrl.toString(),
            format,
            youtubeErrorCode: extractionError.code,
          }, 'YouTube upstream did not return extractable metadata')

          if (extractionError.statusCode === 404) {
            /** @type {ExtractKnownResponseType<typeof reply.code<404>>} */
            const responseData = {
              code: extractionError.code,
              description: extractionError.description
            }
            return reply.code(404).send(responseData)
          }

          if (extractionError.statusCode === 424) {
            /** @type {ExtractKnownResponseType<typeof reply.code<424>>} */
            const responseData = {
              code: extractionError.code,
              description: extractionError.description
            }
            return reply.code(424).send(responseData)
          }

          /** @type {ExtractKnownResponseType<typeof reply.code<503>>} */
          const responseData = {
            code: extractionError.code,
            description: extractionError.description
          }
          return reply.code(503).send(responseData)
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
            return reply.status(response.statusCode).send(replyBody)
          }

          // url presence confirms a usable format was resolved — we strip it from the
          // response since discover callers must not store or use it (playback resolves
          // media URLs on demand via /unified at request time).
          if (!replyBody.url) {
            /** @type {ExtractKnownResponseType<typeof reply.code<404>>} */
            const responseData = {
              code: 'no_media_url',
              description: 'No media URL found for URL'
            }
            return reply.code(404).send(responseData)
          }

          /** @type {ReturnBody} */
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

          return reply.code(200).send(responseData)
        } catch (err) {
          fastify.log.error(new Error('Error while requesting yt-dlp info endpoint during discovery', { cause: err }))
          /** @type {ExtractKnownResponseType<typeof reply.code<500>>} */
          const responseData = {
            description: 'Error while requesting yt-dlp info endpoint during discovery'
          }
          return reply.code(500).send(responseData)
        }
      }
    }
  )
}
