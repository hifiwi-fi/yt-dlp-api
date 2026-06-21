/**
 * @import { FromSchema, JSONSchema } from 'json-schema-to-ts'
 * @typedef { typeof envSchema } EnvSchemaType
 * @typedef { FromSchema<EnvSchemaType> } DotEnvSchemaType
 */
import { authBasicEnvSchema } from '#plugins/auth-basic.js'
import { onesiePoolEnvSchema } from '#plugins/onesie-pool.js'
import { otelMetricsEnvSchema } from '#plugins/otel-metrics.js'
import { sentryEnvSchema } from '#plugins/sentry.js'
import { ytDlpServerEnvSchema } from '#plugins/yt-dlp-server.js'

export const envSchema = /** @type {const} @satisfies {JSONSchema} */ ({
  type: 'object',
  $id: 'schema:dotenv',
  additionalProperties: false,
  required: [
    ...authBasicEnvSchema.required,
    ...onesiePoolEnvSchema.required,
    ...otelMetricsEnvSchema.required,
    ...sentryEnvSchema.required,
    ...ytDlpServerEnvSchema.required,
  ],
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

    ...authBasicEnvSchema.properties,
    ...onesiePoolEnvSchema.properties,
    ...otelMetricsEnvSchema.properties,
    ...sentryEnvSchema.properties,
    ...ytDlpServerEnvSchema.properties,
  },
})
