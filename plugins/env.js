import fp from 'fastify-plugin'
import { readFile } from 'fs/promises'
import { join, resolve } from 'path'

/**
 * @import { FromSchema, JSONSchema } from "json-schema-to-ts"
 * @typedef { FromSchema<typeof schema> } SchemaType
 */

export const schema = /** @type {const} @satisfies {JSONSchema} */ ({
  type: 'object',
  required: [],
  properties: {
    ENV: {
      type: 'string',
      default: 'development',
    },
    HOST: {
      // Hostname and port (if needed)
      type: 'string',
      default: 'localhost:5000',
    },
    TRANSPORT: {
      enum: ['http', 'https'],
      default: 'http',
    },
    BASIC_AUTH_USERNAME: {
      type: 'string',
      default: 'user'
    },
    BASIC_AUTH_PASSWORD: {
      type: 'string',
      default: 'pass'
    },
    YTDLPAPI_HOST: {
      type: 'string',
      default: '127.0.0.1:5001'
    },
    TVCONFIG_REFRESH_MS: {
      type: 'number',
      default: 18_000_000
    },
    INNERTUBE_REFRESH_MS: {
      type: 'number',
      default: 172_800_000 // 48 hours in milliseconds
    },
    OTEL_SERVICE_NAME: {
      type: 'string',
      default: 'yt-dlp-api',
    },
    OTEL_SERVICE_VERSION: {
      type: 'string',
      default: '1.0.0',
    },
    OTEL_RESOURCE_ATTRIBUTES: {
      type: 'string',
      default: 'deployment.environment=development',
    },
  },
})

/**
 * This plugins adds config
 *
 * @see https://github.com/fastify/fastify-env
 */
export default fp(async function (fastify, _opts) {
  fastify.register(import('@fastify/env'), {
    schema,
    dotenv: {
      path: resolve(import.meta.dirname, '../.env'),
      debug: false,
    },
  })

  const __dirname = import.meta.dirname
  const pkg = JSON.parse(await readFile(join(__dirname, '../package.json'), 'utf8'))

  fastify.decorate('pkg', pkg)
}, {
  name: 'env',
})
