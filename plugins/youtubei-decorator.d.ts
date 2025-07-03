import 'fastify'
import type { onesieFormatRequest } from '../lib/onesie/index.js'
import type { YouTubeTVClientConfig } from '../lib/onesie/tv-config.js'
import type { InnertubeConfig } from '../lib/onesie/innertube-config.js'

declare module 'fastify' {
  interface FastifyInstance {
    youtubei: {
      innertubeConfig: InnertubeConfig,
      tvConfig: YouTubeTVClientConfig,
      onesieFormatRequest: typeof onesieFormatRequest
    },
  }
}
