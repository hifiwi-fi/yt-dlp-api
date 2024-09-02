import { SessionManager } from './session_manager.js'

import Fastify from 'fastify'

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
      required: ['visitor_data'],
      properties: {
        visitor_data: { type: 'string' },
        data_sync_id: { type: 'string', nullable: true },
      }
    }),
    response: {
      200: /** @type {const} @satisfies {JSONSchema} */ ({
        type: 'object',
        properties: {
          po_token: { type: 'string' }
        }
      })
    }
  }
}, async (request, reply) => {
  // @ts-ignore
  const visitorData = request.body.visitor_data
  // @ts-ignore
  const dataSyncId = request.body.data_sync_id

  let visitorIdentifier

  // prioritize data sync id for authenticated requests, if passed
  if (dataSyncId) {
    console.log(`Received request for data sync ID: '${dataSyncId}'`)
    visitorIdentifier = dataSyncId
  } else {
    console.log(`Received request for visitor data: '${visitorData}'`)
    visitorIdentifier = visitorData
  }

  const sessionData = await sessionManager.generatePoToken(visitorIdentifier)
  reply.send({ po_token: sessionData.poToken })
})

// Run the server!
const address = await fastify.listen({ port: PORT_NUMBER })

console.log(`listening on ${address}`)
