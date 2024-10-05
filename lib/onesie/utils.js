import crypto from 'node:crypto'

/**
 * @typedef {Object} Encrypted
 * @property {Uint8Array} encrypted
 * @property {Uint8Array} hmac
 * @property {Uint8Array} iv
 */

/**
 * Encrypts the given data using the provided client key.
 *
 * @param {Uint8Array} clientKey - The client key (must be 32 bytes long).
 * @param {Uint8Array} data - The data to encrypt.
 * @returns {Promise<Encrypted>} The encrypted data, HMAC, and IV.
 * @throws {Error} If the client key length is not 32 bytes.
 */
export async function encryptRequest (clientKey, data) {
  if (clientKey.length !== 32) {
    throw new Error('Invalid client key length')
  }

  const aesKeyData = clientKey.slice(0, 16)
  const hmacKeyData = clientKey.slice(16, 32)

  const iv = crypto.getRandomValues(new Uint8Array(16))

  const aesKey = await crypto.subtle.importKey(
    'raw',
    aesKeyData,
    { name: 'AES-CTR', length: 128 },
    false,
    ['encrypt']
  )

  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-CTR', counter: iv, length: 128 },
    aesKey,
    data
  ))

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    hmacKeyData,
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  )

  const hmac = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    hmacKey,
    new Uint8Array([...encrypted, ...iv])
  ))

  return { encrypted, hmac, iv }
}

/**
 * Decrypts the given data using the provided IV, HMAC, and client key.
 *
 * @param {Uint8Array} [iv] - The initialization vector.
 * @param {Uint8Array} [hmac] - The HMAC.
 * @param {Uint8Array} [data] - The encrypted data.
 * @param {Uint8Array} [clientKeyData] - The client key data (must be 32 bytes long).
 * @returns {Promise<Uint8Array>} The decrypted data.
 * @throws {Error} If any of the inputs are invalid or HMAC verification fails.
 */
export async function decryptResponse (iv, hmac, data, clientKeyData) {
  if (!iv || !hmac || !data || !clientKeyData) { throw new Error('Invalid input') }

  const aesKey = await crypto.subtle.importKey(
    'raw',
    clientKeyData.slice(0, 16),
    { name: 'AES-CTR', length: 128 },
    false,
    ['decrypt']
  )

  const decryptedData = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: iv, length: 128 },
    aesKey,
    data
  ))

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    clientKeyData.slice(16, 32),
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['verify']
  )

  const isValid = await crypto.subtle.verify(
    'HMAC',
    hmacKey,
    hmac,
    new Uint8Array([...data, ...iv])
  )

  if (!isValid) { throw new Error('HMAC verification failed') }

  return decryptedData
}
