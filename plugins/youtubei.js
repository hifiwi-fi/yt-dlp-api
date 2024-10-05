import fp from 'fastify-plugin'
import { onesieFormatRequest } from '../lib/onesie/index.js'
import { TvConfig } from '../lib/onesie/tv-config.js'
import Innertube, { UniversalCache } from 'youtubei.js'

export default fp(async function (fastify, _) {
  const youtubei = {
    innertube: await Innertube.create({ cache: new UniversalCache(true) }),
    tvConfig: new TvConfig({
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
