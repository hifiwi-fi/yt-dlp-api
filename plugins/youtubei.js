import fp from 'fastify-plugin'
import Innertube, { UniversalCache } from 'youtubei.js'
import { onesieFormatRequest } from '../lib/onesie/index.js'
import { YouTubeTVClientConfig } from '../lib/onesie/tv-config.js'

export default fp(async function (fastify, _) {
  const youtubei = {
    innertube: await Innertube.create({ cache: new UniversalCache(true) }),
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
