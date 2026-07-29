/** @import { IncomingHttpHeaders } from 'node:http' */

export const breadcrumRequestIdHeader = 'x-breadcrum-request-id'

/**
 * @param {IncomingHttpHeaders} headers
 * @returns {string | undefined}
 */
export function getParentRequestId (headers) {
  const value = headers[breadcrumRequestIdHeader]
  return Array.isArray(value) ? value[0] : value
}
