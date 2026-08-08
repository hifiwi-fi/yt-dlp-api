import { performance } from 'node:perf_hooks'

/**
 * @import { ChildProcess } from 'node:child_process'
 */

const completedShutdowns = new WeakMap()

/**
 * @typedef {Object} SubprocessLogger
 * @property {(context: object, message: string) => void} info
 * @property {(context: object, message: string) => void} warn
 * @property {(context: object, message: string) => void} [error]
 */

/**
 * @typedef {Object} ShutdownResult
 * @property {number | undefined} pid
 * @property {number | null} code
 * @property {NodeJS.Signals | null} signal
 * @property {number} elapsedMs
 * @property {boolean} forceKillRequired
 */

/**
 * Shut down a direct child and force-kill its process group if it does not exit.
 *
 * The child must have been spawned with `detached: true` for the process-group
 * kill to include descendants.
 *
 * @param {Object} options
 * @param {ChildProcess} options.child
 * @param {SubprocessLogger} options.logger
 * @param {number} options.gracefulTimeoutMs
 * @param {number} [options.forceKillTimeoutMs]
 * @returns {Promise<ShutdownResult>}
 */
export function shutdownSubprocess ({
  child,
  logger,
  gracefulTimeoutMs,
  forceKillTimeoutMs = 500,
}) {
  const existingShutdown = completedShutdowns.get(child)
  if (existingShutdown) return existingShutdown

  const shutdown = performShutdown({
    child,
    logger,
    gracefulTimeoutMs,
    forceKillTimeoutMs,
  })
  completedShutdowns.set(child, shutdown)
  return shutdown
}

/**
 * @param {Object} options
 * @param {() => Promise<void>} options.start
 * @param {SubprocessLogger} options.logger
 * @param {number} options.maxAttempts
 * @param {number} options.restartDelayMs
 */
export function createSubprocessRestarter ({
  start,
  logger,
  maxAttempts,
  restartDelayMs,
}) {
  let attempts = 0
  let isShuttingDown = false
  /** @type {NodeJS.Timeout | null} */
  let restartTimer = null
  /** @type {(() => void) | null} */
  let cancelRestartWait = null

  return {
    /**
     * @param {Object} options
     * @param {boolean} options.expected
     */
    async handleExit ({ expected }) {
      if (expected || isShuttingDown) return

      if (attempts >= maxAttempts) {
        logger.error?.({ attempts, maxAttempts }, 'Maximum subprocess restart attempts reached')
        return
      }

      attempts++
      logger.warn({ attempt: attempts, maxAttempts }, 'Attempting to restart subprocess')

      await new Promise(resolve => {
        cancelRestartWait = resolve
        restartTimer = setTimeout(resolve, restartDelayMs * attempts)
      })
      restartTimer = null
      cancelRestartWait = null

      if (isShuttingDown) return

      try {
        await start()
        attempts = 0
      } catch (err) {
        logger.error?.({ err }, 'Failed to restart subprocess')
      }
    },
    shutdown () {
      isShuttingDown = true
      if (restartTimer) clearTimeout(restartTimer)
      if (cancelRestartWait) cancelRestartWait()
      restartTimer = null
      cancelRestartWait = null
    },
    reset () {
      attempts = 0
    },
  }
}

/**
 * @param {Object} options
 * @param {ChildProcess} options.child
 * @param {SubprocessLogger} options.logger
 * @param {number} options.gracefulTimeoutMs
 * @param {number} options.forceKillTimeoutMs
 * @returns {Promise<ShutdownResult>}
 */
async function performShutdown ({
  child,
  logger,
  gracefulTimeoutMs,
  forceKillTimeoutMs,
}) {
  const startedAt = performance.now()
  const pid = child.pid

  if (hasExited(child)) {
    return shutdownResult(child, pid, startedAt, false)
  }

  const exitPromise = waitForExit(child)
  const signalSent = child.kill('SIGTERM')

  logger.info({
    pid,
    signal: 'SIGTERM',
    signalSent,
    gracefulTimeoutMs,
  }, 'Sent graceful shutdown signal to subprocess')

  const exitedGracefully = signalSent && await waitWithTimeout(exitPromise, gracefulTimeoutMs)
  if (exitedGracefully || hasExited(child)) {
    const result = shutdownResult(child, pid, startedAt, false)
    logger.info(result, 'Subprocess shutdown completed')
    return result
  }

  const forceSignalSent = killSubprocessGroup(child, 'SIGKILL')
  logger.warn({
    pid,
    signal: 'SIGKILL',
    signalSent: forceSignalSent,
    elapsedMs: elapsed(startedAt),
  }, 'Force killing subprocess group after graceful shutdown timeout')

  const forceKilled = await waitWithTimeout(exitPromise, forceKillTimeoutMs)
  if (!forceKilled && !hasExited(child)) {
    throw new Error(`Subprocess ${pid ?? 'with unknown PID'} did not exit after SIGKILL`)
  }

  const result = shutdownResult(child, pid, startedAt, true)
  logger.info(result, 'Subprocess shutdown completed')
  return result
}

/**
 * @param {ChildProcess} child
 * @returns {Promise<void>}
 */
function waitForExit (child) {
  if (hasExited(child)) return Promise.resolve()

  return new Promise((resolve) => {
    child.once('exit', resolve)

    if (hasExited(child)) {
      child.removeListener('exit', resolve)
      resolve()
    }
  })
}

/**
 * @param {Promise<void>} exitPromise
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function waitWithTimeout (exitPromise, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs)

    exitPromise.then(() => {
      clearTimeout(timeout)
      resolve(true)
    })
  })
}

/**
 * @param {ChildProcess} child
 * @param {NodeJS.Signals} signal
 * @returns {boolean}
 */
export function killSubprocessGroup (child, signal) {
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal)
      return true
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ESRCH') throw err
    }
  }

  return child.kill(signal)
}

/**
 * @param {ChildProcess} child
 * @returns {boolean}
 */
function hasExited (child) {
  return child.exitCode !== null || child.signalCode !== null
}

/**
 * @param {ChildProcess} child
 * @param {number | undefined} pid
 * @param {number} startedAt
 * @param {boolean} forceKillRequired
 * @returns {ShutdownResult}
 */
function shutdownResult (child, pid, startedAt, forceKillRequired) {
  return {
    pid,
    code: child.exitCode,
    signal: child.signalCode,
    elapsedMs: elapsed(startedAt),
    forceKillRequired,
  }
}

/**
 * @param {number} startedAt
 * @returns {number}
 */
function elapsed (startedAt) {
  return Math.round(performance.now() - startedAt)
}
