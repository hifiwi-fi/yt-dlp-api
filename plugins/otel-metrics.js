/**
 * @import { JSONSchema } from 'json-schema-to-ts'
 */
import fp from 'fastify-plugin'
import { metrics } from '@opentelemetry/api'

export const otelMetricsEnvSchema = /** @type {const} @satisfies {JSONSchema} */ ({
  properties: {
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
  required: [],
})

/**
 * This plugin adds OpenTelemetry metrics under the 'otel' decorator.
 * These are basic metrics to monitor the yt-dlp-api service.
 */
export default fp(async function (fastify, _) {
  // Create meter for custom metrics
  const meter = metrics.getMeter('yt-dlp-api', '1.0.0')

  fastify.decorate('otel', {
    meter,
  })
},
{
  name: 'otel-metrics',
  dependencies: ['env'],
})
