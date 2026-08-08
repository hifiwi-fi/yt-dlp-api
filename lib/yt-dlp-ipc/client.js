import { randomUUID } from 'node:crypto'

import { encodeFrame, FrameDecoder } from './framed-json.js'
import { shutdownSubprocess } from '../shutdown-subprocess.js'

/**
 * @import { ChildProcess, ChildProcessByStdio } from 'node:child_process'
 * @import { Duplex, Readable, Writable } from 'node:stream'
 */

/**
 * @typedef {null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue}} JsonValue
 */

/**
 * @typedef {Object} IpcLogger
 * @property {(context: object, message: string) => void} info
 * @property {(context: object, message: string) => void} warn
 * @property {(context: object, message: string) => void} error
 */

/**
 * @typedef {Object} PendingRequest
 * @property {(value: YtDlpIpcResponse) => void} resolve
 * @property {(error: Error) => void} reject
 * @property {NodeJS.Timeout} timeout
 */

/**
 * @typedef {Object} YtDlpIpcResponse
 * @property {number} statusCode
 * @property {JsonValue} body
 */

export class YtDlpIpcError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor (code, message) {
    super(message)
    this.name = 'YtDlpIpcError'
    this.code = code
  }
}

export class YtDlpIpcClient {
  /**
   * @param {Object} options
   * @param {ChildProcessByStdio<Writable, Readable, Readable>} options.child
   * @param {Duplex} options.responseStream
   * @param {IpcLogger} options.logger
   * @param {number} options.startupTimeoutMs
   * @param {number} options.requestTimeoutMs
   * @param {number} options.maxPendingRequests
   */
  constructor ({
    child,
    responseStream,
    logger,
    startupTimeoutMs,
    requestTimeoutMs,
    maxPendingRequests,
  }) {
    this.child = child
    this.responseStream = responseStream
    this.logger = logger
    this.requestTimeoutMs = requestTimeoutMs
    this.maxPendingRequests = maxPendingRequests
    this.decoder = new FrameDecoder()
    /** @type {Map<string, PendingRequest>} */
    this.pending = new Map()
    this.isReady = false
    this.isClosing = false
    this.isFailed = false
    /** @type {Promise<void> | null} */
    this.closePromise = null

    /** @type {(value?: void | PromiseLike<void>) => void} */
    let resolveReady
    /** @type {(reason?: unknown) => void} */
    let rejectReady
    this.ready = new Promise((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    this.resolveReady = resolveReady
    this.rejectReady = rejectReady

    this.startupTimeout = setTimeout(() => {
      const error = new YtDlpIpcError(
        'PYTHON_STARTUP_TIMEOUT',
        `Python IPC worker did not become ready within ${startupTimeoutMs}ms`
      )
      this.rejectReady(error)
      this.terminateInBackground(error)
    }, startupTimeoutMs)

    responseStream.on('data', (chunk) => {
      try {
        for (const message of this.decoder.push(chunk)) this.handleMessage(message)
      } catch (err) {
        this.terminateInBackground(/** @type {Error} */ (err))
      }
    })
    responseStream.on('error', (err) => {
      this.terminateInBackground(err)
    })
    responseStream.on('end', () => {
      try {
        this.decoder.finish()
        if (!this.isClosing && !hasExited(this.child)) {
          this.terminateInBackground(new YtDlpIpcError(
            'PYTHON_PROTOCOL_ERROR',
            'Python IPC response stream closed unexpectedly'
          ))
        }
      } catch (err) {
        this.terminateInBackground(/** @type {Error} */ (err))
      }
    })

    child.once('exit', (code, signal) => {
      clearTimeout(this.startupTimeout)
      const error = new YtDlpIpcError(
        'PYTHON_PROCESS_EXITED',
        `Python IPC worker exited with code ${code} and signal ${signal}`
      )
      if (!this.isReady) this.rejectReady(error)
      this.failPending(error)
    })
    child.once('error', (err) => {
      clearTimeout(this.startupTimeout)
      if (!this.isReady) this.rejectReady(err)
      this.failPending(err)
    })
  }

  get pid () { return this.child.pid }

  get running () {
    return this.isReady &&
      !this.isClosing &&
      !this.isFailed &&
      this.child.exitCode === null &&
      this.child.signalCode === null
  }

  /**
   * @param {string} method
   * @param {{[key: string]: JsonValue}} [params]
   * @returns {Promise<YtDlpIpcResponse>}
   */
  async request (method, params = {}) {
    await this.ready

    if (!this.running) {
      throw new YtDlpIpcError('PYTHON_NOT_AVAILABLE', 'Python IPC worker is not available')
    }
    if (this.pending.size >= this.maxPendingRequests) {
      throw new YtDlpIpcError('PYTHON_QUEUE_FULL', 'Python IPC request queue is full')
    }

    const id = randomUUID()
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        const error = new YtDlpIpcError(
          'PYTHON_REQUEST_TIMEOUT',
          `Python IPC request exceeded ${this.requestTimeoutMs}ms`
        )
        reject(error)
        this.terminateInBackground(error)
      }, this.requestTimeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
    })

    try {
      await this.write({ id, method, params })
    } catch (err) {
      const pending = this.pending.get(id)
      if (pending) {
        clearTimeout(pending.timeout)
        this.pending.delete(id)
        pending.reject(/** @type {Error} */ (err))
      }
      this.terminateInBackground(/** @type {Error} */ (err))
    }

    return response
  }

  /**
   * @param {Object} params
   * @param {string} params.url
   * @param {string} params.format
   * @returns {Promise<YtDlpIpcResponse>}
   */
  info ({ url, format }) {
    return this.request('info', { url, format })
  }

  /** @returns {Promise<YtDlpIpcResponse>} */
  ytdlp () {
    return this.request('ytdlp')
  }

  /**
   * @param {Object} [options]
   * @param {number} [options.gracefulTimeoutMs]
   * @returns {Promise<void>}
   */
  close ({ gracefulTimeoutMs = 2500 } = {}) {
    if (this.closePromise) return this.closePromise
    this.isClosing = true
    this.closePromise = this.performClose(gracefulTimeoutMs)
    return this.closePromise
  }

  /**
   * @param {number} gracefulTimeoutMs
   */
  async performClose (gracefulTimeoutMs) {
    if (hasExited(this.child)) return

    const shutdownId = randomUUID()

    try {
      const exit = waitForExit(this.child, gracefulTimeoutMs)
      await this.write({ id: shutdownId, type: 'shutdown' })
      this.child.stdin.end()
      const graceful = await exit
      if (graceful) return
    } catch (err) {
      this.logger.warn({ err, pid: this.pid }, 'Failed to request graceful Python IPC shutdown')
    }

    await shutdownSubprocess({
      child: this.child,
      logger: this.logger,
      gracefulTimeoutMs: 0,
    })
  }

  /**
   * @param {JsonValue} message
   */
  handleMessage (message) {
    if (!isRecord(message)) {
      this.terminateInBackground(new YtDlpIpcError('PYTHON_PROTOCOL_ERROR', 'IPC message must be an object'))
      return
    }

    if (message.type === 'ready') {
      if (message.version !== 1 ||
          typeof message.pid !== 'number' ||
          typeof message.concurrency !== 'number') {
        this.terminateInBackground(new YtDlpIpcError('PYTHON_PROTOCOL_ERROR', 'Invalid ready message'))
        return
      }
      if (this.isReady) {
        this.terminateInBackground(new YtDlpIpcError('PYTHON_PROTOCOL_ERROR', 'Duplicate ready message'))
        return
      }
      clearTimeout(this.startupTimeout)
      this.isReady = true
      this.resolveReady()
      return
    }

    if (message.type === 'drained') return

    const id = message.id
    if (typeof id !== 'string') {
      this.terminateInBackground(new YtDlpIpcError('PYTHON_PROTOCOL_ERROR', 'IPC response is missing an ID'))
      return
    }

    const pending = this.pending.get(id)
    if (!pending) {
      this.logger.warn({ id, pid: this.pid }, 'Ignoring response for unknown Python IPC request')
      return
    }

    clearTimeout(pending.timeout)
    this.pending.delete(id)

    if ('error' in message) {
      const ipcError = isRecord(message.error) ? message.error : {}
      pending.resolve({
        statusCode: 500,
        body: {
          code: 500,
          name: typeof ipcError.type === 'string' ? ipcError.type : 'PythonError',
          description: typeof ipcError.message === 'string'
            ? ipcError.message
            : 'Python extraction failed',
        },
      })
      return
    }

    if (!('result' in message)) {
      const error = new YtDlpIpcError('PYTHON_PROTOCOL_ERROR', 'IPC response has no result')
      pending.reject(error)
      this.terminateInBackground(error)
      return
    }

    pending.resolve({ statusCode: 200, body: message.result ?? null })
  }

  /**
   * @param {JsonValue} message
   * @returns {Promise<void>}
   */
  write (message) {
    const frame = encodeFrame(message)
    return new Promise((resolve, reject) => {
      this.child.stdin.write(frame, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * @param {Error} error
   */
  terminateInBackground (error) {
    this.isFailed = true
    this.failPending(error)
    this.terminateAfterFailure(error).catch((terminationError) => {
      this.logger.error({
        err: terminationError,
        pid: this.pid,
      }, 'Failed to terminate unhealthy Python IPC worker')
    })
  }

  /**
   * @param {Error} error
   */
  async terminateAfterFailure (error) {
    if (hasExited(this.child)) return

    this.logger.error({ err: error, pid: this.pid }, 'Terminating unhealthy Python IPC worker')
    await shutdownSubprocess({
      child: this.child,
      logger: this.logger,
      gracefulTimeoutMs: 500,
    })
  }

  /**
   * @param {Error} error
   */
  failPending (error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

/**
 * @param {ChildProcess} child
 */
function hasExited (child) {
  return child.exitCode !== null || child.signalCode !== null
}

/**
 * @param {JsonValue} value
 * @returns {value is {[key: string]: JsonValue}}
 */
function isRecord (value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {ChildProcess} child
 * @param {number} timeoutMs
 */
function waitForExit (child, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true)

  return new Promise(resolve => {
    const onExit = () => {
      clearTimeout(timeout)
      resolve(true)
    }
    const timeout = setTimeout(() => {
      child.removeListener('exit', onExit)
      resolve(false)
    }, timeoutMs)
    child.once('exit', onExit)
  })
}
