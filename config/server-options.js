/**
 * @import { FastifyServerOptions, FastifyPluginOptions } from 'fastify'
 * @import { DotEnvSchemaType } from '../config/env-schema.js'
 */
import { resolve } from 'path'
import hyperid from 'hyperid'
import { loggerOptions } from './logger-options.js'

const hid = hyperid()

const fastifyPluginTimeoutMs = parsePositiveIntegerEnv(
  'FASTIFY_PLUGIN_TIMEOUT_MS',
  process.env['FASTIFY_PLUGIN_TIMEOUT_MS'],
  150000
)

const fastifyOptions = /** @type{const} @satisfies {Partial<FastifyServerOptions>} */ ({
  pluginTimeout: fastifyPluginTimeoutMs,
  trustProxy: true,
  genReqId: function (/* req */) { return hid() },
  disableRequestLogging: request => request.url === '/health',
  logger: loggerOptions,
})

const applicationOptions = /** @type {const} */ ({
  dotEnvPath: resolve(import.meta.dirname, '../.env')
})

/**
 * @typedef {Partial<FastifyServerOptions> &
 *  Partial<FastifyPluginOptions> &
 *  typeof applicationOptions &
 *  Partial<{
 *    envData: Partial<DotEnvSchemaType>
 *  }>
 * } AppOptions
 */

export const options = /** @type{const} @satisfies {AppOptions} */({
  ...fastifyOptions,
  ...applicationOptions
})

/**
 * @param {string} name
 * @param {string | undefined} value
 * @param {number} fallback
 */
export function parsePositiveIntegerEnv (name, value, fallback) {
  if (value === undefined) return fallback

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`)
  }

  return parsed
}
