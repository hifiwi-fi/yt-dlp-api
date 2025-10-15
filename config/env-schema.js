/**
 * @import { FromSchema, JSONSchema } from "json-schema-to-ts"
 * @typedef { typeof envSchema } EnvSchemaType
 * @typedef { FromSchema<EnvSchemaType> } DotEnvSchemaType
 */

export const envSchema = /** @type {const} @satisfies {JSONSchema} */ ({
  type: 'object',
  $id: 'schema:dotenv',
  required: [],
  additionalProperties: false,
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
    YTDLPAPI_USER: {
      type: 'string',
      default: 'user'
    },
    YTDLPAPI_PASSWORD: {
      type: 'string',
      default: 'pass'
    },
    TVCONFIG_REFRESH_MS: {
      type: 'number',
      default: 18_000_000
    },
    INNERTUBE_REFRESH_MS: {
      type: 'number',
      default: 172_800_000 // 48 hours in milliseconds
    },
    YOUTUBE_PLAYER_ID: {
      type: 'string',
      // TODO: unset this when not needed any longer
      // default: '0004de42'
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
    REDIS_CACHE_URL: {
      type: 'string',
      default: 'redis://localhost:6379/1',
    },
  },
})
