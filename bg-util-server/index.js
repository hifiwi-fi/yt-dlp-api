import * as SM from './session_manager.cjs'
import Fastify from 'fastify'

const { SessionManager } = SM

/**
 * @import { JSONSchema } from 'json-schema-to-ts'
 * @import { FastifyPluginAsyncJsonSchemaToTs } from '@fastify/type-provider-json-schema-to-ts'
 */

const fastify = Fastify({
  logger: true
})

const PORT_NUMBER = 4416
const sessionManager = new SessionManager()

/**
 * Handles POST requests to the /get_pot endpoint.
 * @type {FastifyPluginAsyncJsonSchemaToTs}
 */
fastify.post('/get_pot', {
  schema: {
    body: /** @type {const} @satisfies {JSONSchema} */ ({
      type: 'object',
      required: [],
      properties: {
        visitor_data: { type: 'string', nullable: true },
        data_sync_id: { type: 'string', nullable: true },
        proxy: { type: 'string', nullable: true }
      }
    }),
    response: {
      200: /** @type {const} @satisfies {JSONSchema} */ ({
        type: 'object',
        properties: {
          po_token: { type: 'string' },
          visit_identifier: { type: 'string' }
        }
      })
    }
  }
}, async (request, reply) => {
  const { visitor_data: visitorData, data_sync_id: dataSyncId, proxy } = request.body
  let visitIdentifier

  // prioritize data sync id for authenticated requests, if passed
  if (dataSyncId) {
    console.log(`Received request for data sync ID: '${dataSyncId}'`)
    visitIdentifier = dataSyncId;
  } else if (visitorData) {
    console.log(`Received request for visitor data: '${visitorData}'`)
    visitIdentifier = visitorData;
  } else {
    console.log(`Received request for visitor data, grabbing from Innertube`);
    const generatedVisitorData = await sessionManager.generateVisitorData();
    if (!generatedVisitorData) {
      reply.status(500).send({ error: "Error generating visitor data" });
      return;
    }
    console.log(`Generated visitor data: ${generatedVisitorData}`);
    visitIdentifier = generatedVisitorData;
  }

  const sessionData = await sessionManager.generatePoToken(visitIdentifier, proxy);
  reply.send({
    po_token: sessionData.poToken,
    visit_identifier: sessionData.visitIdentifier
  });
});

// /invalidate_caches route
fastify.post('/invalidate_caches', async (request, reply) => {
  sessionManager.invalidateCaches();
  reply.send();
});

// /ping route
fastify.get('/ping', async (request, reply) => {
  reply.send({
    logging: fastify.log.level === 'debug' ? "verbose" : "normal",
    token_ttl_hours: process.env.TOKEN_TTL || 6,
    server_uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Run the server!
const address = await fastify.listen({ port: PORT_NUMBER })
console.log(`listening on ${address}`)
