/** @import { FastifyBaseLogger, FastifyPluginAsync } from 'fastify' */
import fp from 'fastify-plugin'
import { getParentRequestId } from '#lib/request-correlation.js'

/** @type {FastifyPluginAsync} */
async function requestCorrelation (fastify) {
  fastify.addHook('onRequest', async function bindParentRequestId (request) {
    const parentRequestId = getParentRequestId(request.headers)
    if (!parentRequestId) return

    const requestLogger = /** @type {FastifyBaseLogger & {setBindings?: (bindings: Record<string, unknown>) => void}} */ (request.log)
    requestLogger.setBindings?.({ parentRequestId })
  })
}

export default fp(requestCorrelation, {
  name: 'request-correlation',
})
