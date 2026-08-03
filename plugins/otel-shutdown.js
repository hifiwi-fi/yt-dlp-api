import fp from 'fastify-plugin'
import { registerOtelShutdown } from '#lib/otel-shutdown.js'

export default fp(async function otelShutdown (fastify) {
  registerOtelShutdown(fastify)
}, {
  name: 'otel-shutdown',
})
