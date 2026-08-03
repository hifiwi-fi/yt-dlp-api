import fp from 'fastify-plugin'

export default fp(async function (fastify, _opts) {
  fastify.get('/health', {
    onRequest: async function logHealthRequest (request) {
      request.log.debug({ req: request }, 'incoming request')
    },
    onResponse: async function logHealthResponse (_request, reply) {
      reply.log.debug({
        res: reply,
        responseTime: reply.elapsedTime,
      }, 'request completed')
    },
  }, async function () {
    return { statusCode: 200, status: 'ok' }
  })
}, {
  name: 'health',
})
