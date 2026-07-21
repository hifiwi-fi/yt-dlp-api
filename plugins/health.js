import fp from 'fastify-plugin'

export default fp(async function (fastify, _opts) {
  fastify.get('/health', async function () {
    return { statusCode: 200, status: 'ok' }
  })
}, {
  name: 'health',
})
