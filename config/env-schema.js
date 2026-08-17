/**
 * @import { FromSchema, JSONSchema } from 'json-schema-to-ts'
 * @import { EnvSchemaFragment } from '#lib/env-schema.js'
 * @typedef { typeof envSchema } EnvSchemaType
 * @typedef { FromSchema<EnvSchemaType> } DotEnvSchemaType
 */
import { mergeEnvSchemas } from '#lib/env-schema.js'
import { authBasicEnvSchema } from '#plugins/auth-basic.js'
import { onesiePoolEnvSchema } from '#plugins/onesie-pool.js'
import { otelMetricsEnvSchema } from '#plugins/otel-metrics.js'
import { redisEnvSchema } from '#plugins/redis.js'
import { sentryEnvSchema } from '#plugins/sentry.js'
import { ytDlpServerEnvSchema } from '#plugins/yt-dlp-server.js'

const pluginEnvSchemas = /** @type {const} @satisfies {readonly EnvSchemaFragment[]} */ ([
  authBasicEnvSchema,
  onesiePoolEnvSchema,
  otelMetricsEnvSchema,
  redisEnvSchema,
  sentryEnvSchema,
  ytDlpServerEnvSchema,
])

const pluginEnvSchema = mergeEnvSchemas(pluginEnvSchemas)

export const envSchema = /** @type {const} @satisfies {JSONSchema} */ ({
  type: 'object',
  $id: 'schema:dotenv',
  additionalProperties: false,
  required: pluginEnvSchema.required,
  properties: {
    ENV: {
      type: 'string',
      default: 'development',
    },
    FASTIFY_PLUGIN_TIMEOUT_MS: {
      type: 'number',
      default: 150000,
      minimum: 1,
    },
    HOST: {
      // Hostname and port (if needed)
      type: 'string',
      default: 'localhost:3010',
    },
    TRANSPORT: {
      enum: ['http', 'https'],
      default: 'http',
    },

    ...pluginEnvSchema.properties,
  },
})
