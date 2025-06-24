import process from 'node:process'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { FastifyOtelInstrumentation } from '@fastify/otel'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node'
import { HostMetrics } from '@opentelemetry/host-metrics'
import { metrics } from '@opentelemetry/api'

export const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'yt-dlp-api',
  }),
  metricReader: new PrometheusExporter({ port: 9093 }), // Maintain same port as before
  instrumentations: [
    new HttpInstrumentation(),
    new RuntimeNodeInstrumentation({
      monitoringPrecision: 5000,
    }),
  ],
})

sdk.start()

export const fastifyOtelInstrumentation = new FastifyOtelInstrumentation({
  registerOnInitialization: true,
})

// Must come after sdk.start() for getMeterProvider to return something
new HostMetrics({ meterProvider: metrics.getMeterProvider() }).start()

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(
      () => console.log('SDK shut down successfully'),
      (err) => console.log(new Error('Error shutting down SDK', { cause: err }))
    )
})
