const FRAME_HEADER_SIZE = 4
export const DEFAULT_MAX_FRAME_SIZE = 64 * 1024 * 1024

/**
 * @typedef {null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue}} JsonValue
 */

export class FrameError extends Error {
  /**
   * @param {string} message
   */
  constructor (message) {
    super(message)
    this.name = 'FrameError'
  }
}

/**
 * @param {JsonValue} value
 * @param {number} [maxFrameSize]
 * @returns {Buffer}
 */
export function encodeFrame (value, maxFrameSize = DEFAULT_MAX_FRAME_SIZE) {
  const payload = Buffer.from(JSON.stringify(value))
  if (payload.length === 0) throw new FrameError('Frame payload cannot be empty')
  if (payload.length > maxFrameSize) {
    throw new FrameError(`Frame exceeds ${maxFrameSize} byte limit`)
  }

  const frame = Buffer.allocUnsafe(FRAME_HEADER_SIZE + payload.length)
  frame.writeUInt32BE(payload.length, 0)
  payload.copy(frame, FRAME_HEADER_SIZE)
  return frame
}

export class FrameDecoder {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxFrameSize]
   */
  constructor ({ maxFrameSize = DEFAULT_MAX_FRAME_SIZE } = {}) {
    this.maxFrameSize = maxFrameSize
    this.buffer = Buffer.alloc(0)
  }

  /**
   * @param {Buffer | Uint8Array} chunk
   * @returns {JsonValue[]}
   */
  push (chunk) {
    this.buffer = this.buffer.length === 0
      ? Buffer.from(chunk)
      : Buffer.concat([this.buffer, chunk])

    /** @type {JsonValue[]} */
    const messages = []
    while (this.buffer.length >= FRAME_HEADER_SIZE) {
      const payloadLength = this.buffer.readUInt32BE(0)
      if (payloadLength === 0) throw new FrameError('Frame payload cannot be empty')
      if (payloadLength > this.maxFrameSize) {
        throw new FrameError(`Frame exceeds ${this.maxFrameSize} byte limit`)
      }

      const frameLength = FRAME_HEADER_SIZE + payloadLength
      if (this.buffer.length < frameLength) break

      const payload = this.buffer.subarray(FRAME_HEADER_SIZE, frameLength)
      this.buffer = this.buffer.subarray(frameLength)

      try {
        messages.push(/** @type {JsonValue} */ (JSON.parse(payload.toString('utf8'))))
      } catch (err) {
        throw new FrameError(`Invalid JSON frame: ${/** @type {Error} */ (err).message}`)
      }
    }

    return messages
  }

  finish () {
    if (this.buffer.length !== 0) throw new FrameError('IPC stream ended with a partial frame')
  }
}
