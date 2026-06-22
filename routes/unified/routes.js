import { request as undiciRequest } from 'undici'
import { isYouTubeUrl } from '@bret/is-youtube-url'
import { ytDlpFormats } from '../yt-dlp-formats.js'

/**
* @import { FastifyPluginAsyncJsonSchemaToTs } from '@fastify/type-provider-json-schema-to-ts'
* @import { JSONSchema } from 'json-schema-to-ts'
* @import { OnesieFormatResults } from '#lib/onesie/index.js'
* @import { ExtractKnownResponseType } from '#types/fastify-utils.js'
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
          const results = /** @type {OnesieFormatResults} */ (await fastify.runTask({
            url: parsedUrl.toString(),
            format,
            returnRedirectUrl: true
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
          }, 'YouTube upstream did not return extractable media data')

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
            return reply.status(response.statusCode).send(replyBody)
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
          /** @type {ExtractKnownResponseType<typeof reply.code<500>>} */
          const responseData = {
            description: 'Error while requesting yt-dlp endpoint'
          }
          return reply.code(500).send(responseData)
        }
      }
    }
  )
}

/**
 * @typedef {Object} YouTubeExtractionErrorResponse
 * @property {number} statusCode
 * @property {string} code
 * @property {string} description
 */

/**
 * Classifies failures from the YouTube Onesie extraction path into stable API
 * responses. Keep retryable dependency failures in the 5xx range so callers can
 * retry without treating them as application crashes.
 *
 * @param {Error} err
 * @returns {YouTubeExtractionErrorResponse}
 */
export function getYouTubeExtractionErrorResponse (err) {
  const message = getErrorChainMessage(err)

  if (message.includes('No matching formats found')) {
    return {
      statusCode: 404,
      code: 'no_matching_formats',
      description: 'No matching formats found'
    }
  }

  if (message.includes('No videoId resolved') || message.includes('Error while resolving videoId')) {
    return {
      statusCode: 424,
      code: 'youtube_video_id_unresolved',
      description: 'Could not resolve a YouTube video ID from the source URL'
    }
  }

  if (message.includes('HEAD check failed')) {
    return {
      statusCode: 503,
      code: 'youtube_media_url_unavailable',
      description: 'YouTube media URL is not currently available'
    }
  }

  if (
    message.includes('Missing clientKeyData from tvConfig') ||
    message.includes('Missing onesieUstreamerConfig from tvConfig') ||
    message.includes('Missing encryptedClientKey from tvConfig') ||
    message.includes('Missing baseUrl from tvConfig')
  ) {
    return {
      statusCode: 503,
      code: 'youtube_client_config_unavailable',
      description: 'YouTube client configuration is not currently available'
    }
  }

  return {
    statusCode: 503,
    code: 'youtube_upstream_unavailable',
    description: 'YouTube is not currently returning extractable media data'
  }
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function getErrorChainMessage (err) {
  if (!(err instanceof Error)) return String(err)

  const messages = [err.message]
  let cause = err.cause

  while (cause instanceof Error) {
    messages.push(cause.message)
    cause = cause.cause
  }

  return messages.join(' | ')
}
