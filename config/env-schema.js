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
import { sentryEnvSchema } from '#plugins/sentry.js'
import { ytDlpServerEnvSchema } from '#plugins/yt-dlp-server.js'

const pluginEnvSchemas = /** @type {const} @satisfies {readonly EnvSchemaFragment[]} */ ([
  authBasicEnvSchema,
  onesiePoolEnvSchema,
  otelMetricsEnvSchema,
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
