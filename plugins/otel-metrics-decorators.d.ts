import 'fastify'
import type { Counter, Histogram, Meter } from '@opentelemetry/api'

declare module 'fastify' {
  interface FastifyInstance {
    otel: {
      meter: Meter;
    };
  }
}
