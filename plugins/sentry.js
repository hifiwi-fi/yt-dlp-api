/**
 * @import { JSONSchema } from 'json-schema-to-ts'
 */
import fp from 'fastify-plugin'

export const sentryEnvSchema = /** @type {const} @satisfies {JSONSchema} */ ({
  properties: {
    SENTRY_DSN: {
      type: 'string',
    },
    SENTRY_RELEASE: {
      type: 'string',
    },
  },
  required: [],
})

export default fp(async function sentryPlugin (fastify) {
  if (!fastify.config.SENTRY_DSN) return

  const Sentry = await import('@sentry/node')
  fastify.addHook('onError', async (_request, reply, error) => {
    if (shouldHandleSentryError(error, reply.statusCode)) {
      Sentry.captureException(error, { mechanism: { handled: false, type: 'auto.function.fastify' } })
    }
  })
}, {
  name: 'sentry',
  dependencies: ['env'],
})

/**
 * @param {Error} error
 * @param {number} replyStatusCode
 * @returns {boolean}
 */
export function shouldHandleSentryError (error, replyStatusCode) {
  const errorStatusCode = getErrorStatusCode(error)
  if (errorStatusCode) return errorStatusCode >= 500

  if (isExpectedClientError(error)) return false

  // Fastify may not have assigned the final error response status yet, so a
  // reply still marked 2xx on the error path should be reported.
  return replyStatusCode >= 500 || replyStatusCode <= 299
}

/**
 * @param {Error} error
 * @returns {number | undefined}
 */
function getErrorStatusCode (error) {
  const httpError = /** @type {Error & { status?: unknown, statusCode?: unknown }} */ (error)
  const statusCode = httpError.statusCode ?? httpError.status

  return typeof statusCode === 'number' ? statusCode : undefined
}

/**
 * @param {Error} error
 * @returns {boolean}
 */
function isExpectedClientError (error) {
  const httpError = /** @type {Error & { code?: unknown, expose?: unknown, validation?: unknown, validationContext?: unknown }} */ (error)

  if (httpError.expose === true) return true
  if (httpError.code === 'FST_ERR_VALIDATION') return true
  if (Array.isArray(httpError.validation)) return true
  if (typeof httpError.validationContext === 'string') return true

  return isClientHttpErrorName(error.name)
}

const clientHttpErrorNames = new Set([
  'BadRequestError',
  'UnauthorizedError',
  'ForbiddenError',
  'NotFoundError',
  'MethodNotAllowedError',
  'NotAcceptableError',
  'ProxyAuthenticationRequiredError',
  'RequestTimeoutError',
  'ConflictError',
  'GoneError',
  'LengthRequiredError',
  'PreconditionFailedError',
  'PayloadTooLargeError',
  'URITooLongError',
  'UnsupportedMediaTypeError',
  'RangeNotSatisfiableError',
  'ExpectationFailedError',
  'ImATeapotError',
  'MisdirectedRequestError',
  'UnprocessableEntityError',
  'LockedError',
  'FailedDependencyError',
  'TooEarlyError',
  'UpgradeRequiredError',
  'PreconditionRequiredError',
  'TooManyRequestsError',
  'RequestHeaderFieldsTooLargeError',
  'UnavailableForLegalReasonsError',
])

/**
 * @param {string} name
 * @returns {boolean}
 */
function isClientHttpErrorName (name) {
  return clientHttpErrorNames.has(name)
}
