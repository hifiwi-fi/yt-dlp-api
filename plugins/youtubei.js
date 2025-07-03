import fp from 'fastify-plugin'
import { onesieFormatRequest } from '../lib/onesie/index.js'
import { YouTubeTVClientConfig } from '../lib/onesie/tv-config.js'
import { InnertubeConfig } from '../lib/onesie/innertube-config.js'

export default fp(async function (fastify, _) {
  const youtubei = {
    innertubeConfig: new InnertubeConfig({
      refreshMs: fastify.config.INNERTUBE_REFRESH_MS,
      logger: fastify.log
    }),
    tvConfig: new YouTubeTVClientConfig({
      refreshMs: fastify.config.TVCONFIG_REFRESH_MS,
      logger: fastify.log
    }),
    onesieFormatRequest
  }

  fastify.decorate('youtubei', youtubei)
}, {
  name: 'youtubei',
  dependencies: ['env'],
})
