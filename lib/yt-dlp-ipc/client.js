import { randomUUID } from 'node:crypto'

import { encodeFrame, FrameDecoder } from './framed-json.js'
import { shutdownSubprocess } from '../shutdown-subprocess.js'

/**
 * Request/response transport for one persistent Python worker generation.
 *
 * The Fastify plugin owns spawning and restarting the process.
 * This client owns the protocol state for that captured child: readiness,
 * framed request writes, response correlation, deadlines, cooperative drain,
 * and fatal transport cleanup.
 * A protocol failure marks this generation unavailable before asynchronously
 * terminating it, preventing new work from entering a worker being replaced.
 */

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

/**
 * Error with a stable machine-readable code for Python IPC transport failures.
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

/**
 * Correlates framed IPC requests with responses for one captured Python child.
 *
 * Instances are generation-scoped and must never be reused for a replacement
 * process.
 * The public `ready` promise resolves only after Python confirms that yt-dlp is
 * imported and its executor is initialized.
 */
export class YtDlpIpcClient {
  /**
   * Attach protocol handling to an already-spawned Python child.
   * @param {Object} options
   * @param {ChildProcessByStdio<Writable, Readable, Readable>} options.child - Captured worker process for this generation.
   * @param {Duplex} options.responseStream - Dedicated fd 3 response channel; stdout and stderr remain logs.
   * @param {IpcLogger} options.logger - Fastify-compatible logger used for lifecycle and transport failures.
   * @param {number} options.startupTimeoutMs - Maximum wait for the Python ready frame.
   * @param {number} options.requestTimeoutMs - Hard deadline after which the whole unhealthy worker is replaced.
   * @param {number} options.maxPendingRequests - Bound on active and executor-queued requests.
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
   * Send one correlated operation after the worker is ready.
   *
   * A hard timeout retires the complete worker because Python cannot safely
   * cancel one running yt-dlp thread.
   * @param {string} method - Python dispatcher method name.
   * @param {{[key: string]: JsonValue}} [params] - JSON-serializable method parameters.
   * @returns {Promise<YtDlpIpcResponse>} HTTP-shaped result consumed by existing Fastify routes.
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
   * Resolve media metadata and a stream URL through yt-dlp.
   * @param {Object} params
   * @param {string} params.url
   * @param {string} params.format
   * @returns {Promise<YtDlpIpcResponse>}
   */
  info ({ url, format }) {
    return this.request('info', { url, format })
  }

  /**
   * Run the retained compatibility extraction against yt-dlp's test video.
   * @returns {Promise<YtDlpIpcResponse>}
   */
  ytdlp () {
    return this.request('ytdlp')
  }

  /**
   * Stop accepting requests and ask Python to drain active executor work.
   *
   * Repeated calls share one promise.
   * If cooperative shutdown misses its deadline, the shared subprocess helper
   * performs the bounded signal and process-group force-kill fallback.
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
   * Validate and dispatch one decoded lifecycle or correlated response frame.
   * Protocol corruption is process-fatal because continuing could associate a
   * response with the wrong request.
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
   * Encode and write one complete request frame to Python stdin.
   * @param {JsonValue} message
   * @returns {Promise<void>} Resolves after Node flushes the frame or rejects on stream failure.
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
   * Synchronously make this generation unavailable, reject pending work, and
   * start bounded process termination without leaving an unhandled rejection.
   * @param {Error} error - Failure explaining why the generation is retired.
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
   * Reject every unresolved request owned by this process generation and clear
   * its deadline timers.
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
