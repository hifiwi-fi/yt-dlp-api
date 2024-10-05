import 'fastify'
import Innertube from 'youtubei.js'
import type { onesieFormatRequest } from '../lib/onesie/index.js'
import type { TvConfig } from '../lib/onesie/index.js'

declare module 'fastify' {
  interface FastifyInstance {
    youtubei: {
      innertube: Innertube,
      tvConfig: TvConfig,
      onesieFormatRequest: typeof onesieFormatRequest
    },
  }
}
