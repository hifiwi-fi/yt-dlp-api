import { parentPort } from 'worker_threads'

/**
 * @import { BaseLogger } from 'pino'
 */

/**
 * @typedef {Object} LogData
 * @property {string} type - Always 'log'
 * @property {string} level - Log level (info, error, warn, debug, trace)
 * @property {string} msg - Log message
 * @property {object} data - Additional log data/context
 */

/**
 * Create a logger that sends log messages to the parent thread via postMessage.
 * This allows workers to use the parent's properly configured logger (with
 * pretty printing, formatters, etc.) instead of configuring their own.
 *
 * @returns {BaseLogger} Logger interface compatible with Pino
 *
 * @example
 * import { createWorkerLogger } from './worker-logger.js'
 * const logger = createWorkerLogger()
 *
 * logger.info('Worker started')
 * logger.error({ err }, 'Task failed')
 */
export function createWorkerLogger () {
  /**
   * Send a log message to the parent thread
   * @param {string} level - Log level
   * @param {string|object} dataOrMsg - Data object or message string
   * @param {string} [msg] - Message string (if first param is data)
   */
  function log (level, dataOrMsg, msg) {
    if (!parentPort) return // No parent to send to

    let logMsg
    let logData

    if (typeof dataOrMsg === 'string') {
      // Called as: logger.info('message')
      logMsg = dataOrMsg
      logData = {}
    } else if (typeof dataOrMsg === 'object' && dataOrMsg !== null) {
      // Called as: logger.info({ data }, 'message')
      logMsg = msg || ''
      logData = dataOrMsg
    } else {
      // Fallback
      logMsg = String(dataOrMsg)
      logData = {}
    }

    parentPort.postMessage({
      type: 'log',
      level,
      msg: logMsg,
      data: logData
    })
  }

  return {
    /**
     * Log at trace level (most verbose)
     * @param {string|object} dataOrMsg - Data object or message string
     * @param {string} [msg] - Message string
     */
    trace: (dataOrMsg, msg) => log('trace', dataOrMsg, msg),

    /**
     * Log at debug level
     * @param {string|object} dataOrMsg - Data object or message string
     * @param {string} [msg] - Message string
     */
    debug: (dataOrMsg, msg) => log('debug', dataOrMsg, msg),

    /**
     * Log at info level
     * @param {string|object} dataOrMsg - Data object or message string
     * @param {string} [msg] - Message string
     */
    info: (dataOrMsg, msg) => log('info', dataOrMsg, msg),

    /**
     * Log at warn level
     * @param {string|object} dataOrMsg - Data object or message string
     * @param {string} [msg] - Message string
     */
    warn: (dataOrMsg, msg) => log('warn', dataOrMsg, msg),

    /**
     * Log at error level
     * @param {string|object} dataOrMsg - Data object or message string
     * @param {string} [msg] - Message string
     */
    error: (dataOrMsg, msg) => log('error', dataOrMsg, msg),

    /**
     * Log at fatal level (most severe)
     * @param {string|object} dataOrMsg - Data object or message string
     * @param {string} [msg] - Message string
     */
    fatal: (dataOrMsg, msg) => log('fatal', dataOrMsg, msg),

    /**
     * No-op flush for compatibility with Pino interface
     */
    flush: () => {
      // Message-based logging doesn't need flushing
    },

    /**
     * Create a child logger with additional bound context
     * @param {object} bindings - Context to bind to all logs
     * @returns {BaseLogger} Child logger
     */
    child: (bindings) => {
      // Create a child logger that includes the bindings in all log calls
      const childLog = (level, dataOrMsg, msg) => {
        if (typeof dataOrMsg === 'string') {
          log(level, { ...bindings }, dataOrMsg)
        } else if (typeof dataOrMsg === 'object' && dataOrMsg !== null) {
          log(level, { ...bindings, ...dataOrMsg }, msg)
        } else {
          log(level, { ...bindings }, String(dataOrMsg))
        }
      }

      return {
        trace: (dataOrMsg, msg) => childLog('trace', dataOrMsg, msg),
        debug: (dataOrMsg, msg) => childLog('debug', dataOrMsg, msg),
        info: (dataOrMsg, msg) => childLog('info', dataOrMsg, msg),
        warn: (dataOrMsg, msg) => childLog('warn', dataOrMsg, msg),
        error: (dataOrMsg, msg) => childLog('error', dataOrMsg, msg),
        fatal: (dataOrMsg, msg) => childLog('fatal', dataOrMsg, msg),
        flush: () => {},
        child: (moreBindings) => {
          // Nested child loggers merge bindings
          return createWorkerLogger().child({ ...bindings, ...moreBindings })
        }
      }
    }
  }
}
