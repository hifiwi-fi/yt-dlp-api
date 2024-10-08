import fp from 'fastify-plugin'
import Fastify from 'fastify'

/**
 * This plugins adds promethius metrics
 *
 * @see https://gitlab.com/m03geek/fastify-metrics
 */
export default fp(async function (fastify, _opts) {
  // @ts-ignore
  await fastify.register((await import('fastify-metrics')).default, {
    defaultMetrics: { enabled: true },
    endpoint: null,
    name: 'metrics',
    routeMetrics: { enabled: true },
  })

  const promServer = Fastify({
    logger: true,
  })

  promServer.route({
    url: '/metrics',
    method: 'GET',
    logLevel: 'info',
    schema: {
      // hide route from swagger plugins
      // @ts-ignore
      hide: true,
    },
    handler: async (_, reply) => {
      reply.type('text/plain').send(await fastify.metrics.client.register.metrics())
    },
  })

  const start = async () => {
    try {
      await promServer.listen({
        port: 9093,
        host: '0.0.0.0',
      })
    } catch (err) {
      promServer.log.error(err)
      promServer.log.info('promethius server stopped')
      process.exit(1)
    }
  }

  if (fastify.config.METRICS) {
    fastify.addHook('onReady', async () => {
      await start()
    })
  }

  // @ts-ignore
  fastify.addHook('onClose', async (instance) => {
    await promServer.close()
  })
},
{
  name: 'prom',
  dependencies: ['env'],
})