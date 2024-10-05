import { request as undiciRequest } from 'undici'

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
              release_timestamp: { type: 'number', nullable: true }
            },
            required: ['url'],
            additionalProperties: false
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
        const results = await fastify.youtubei.onesieFormatRequest(
          parsedUrl.toString(),
          format,
          fastify.youtubei.innertube,
          fastify.youtubei.tvConfig
        )
        return results
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

          const metadata = await response.body.json()

          const responseData = /** @type {const} */({
            // @ts-ignore
            url: metadata?.url,
            // @ts-ignore
            filesize_approx: metadata?.filesize_approx,
            // @ts-ignore
            duration: metadata?.duration,
            // @ts-ignore
            channel: metadata?.channel,
            // @ts-ignore
            title: metadata?.title,
            // @ts-ignore
            ext: metadata?.ext,
            // @ts-ignore
            _type: metadata?._type,
            // @ts-ignore
            description: metadata?.description,
            // @ts-ignore
            uploader_url: metadata?.uploader_url,
            // @ts-ignore
            channel_url: metadata?.channel_url,
            // @ts-ignore
            thumbnail: metadata?.thumbnail,
            // @ts-ignore
            live_status: metadata?.live_status,
            // @ts-ignore
            release_timestamp: metadata?.release_timestamp
          })

          return responseData
        } catch (err) {
          fastify.log.error(new Error('Error while requesting yt-dlp endpoint data', { cause: err }))
          return reply.internalServerError('Error while requesting yt-dlp endpoint data')
        }
      }
    }
  )
}

/**
 * Checks if a given URL belongs to YouTube or Google Video domains.
 *
 * @param {URL} parsedUrl - A valid URL object (already validated by Ajv).
 * @returns {boolean} - Returns true if the URL is for a YouTube or Google Video resource.
 */
function isYouTubeUrl (parsedUrl) {
  const validHosts = new Set([
    'www.youtube.com',
    'youtube.com',
    'm.youtube.com',
    'youtu.be',
    'youtube-nocookie.com',
    'googlevideo.com'
  ])

  // Return true if the host matches any known YouTube or Google video domains
  return validHosts.has(parsedUrl.host)
}

const ytDlpFormats = /** @type {const} */ ({
  audio: 'ba[ext=m4a]/ba[ext=mp4]/ba[ext=mp3]/mp3/m4a',
  video: 'best[ext=mp4]/best[ext=mov]/mp4/mov'
})
