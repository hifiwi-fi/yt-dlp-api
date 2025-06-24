import fp from 'fastify-plugin'
import { metrics } from '@opentelemetry/api'

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
