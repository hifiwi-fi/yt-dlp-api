import { envSchema } from '../config/env-schema.js'
import envPlugin from '../plugins/env.js'
import ytDlpServerPlugin from '../plugins/yt-dlp-server.js'

/**
 * @import { FastifyPluginAsync } from 'fastify'
 */

/** @type {FastifyPluginAsync} */
export default async function PythonShutdownApp (fastify, _opts) {
  fastify.addSchema(envSchema)
  fastify.register(envPlugin, {
    envData: {
      YTDLPAPI_HOST: '127.0.0.1:3911',
    },
  })
  fastify.register(ytDlpServerPlugin)
}
