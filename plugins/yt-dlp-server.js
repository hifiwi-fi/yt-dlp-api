import fp from 'fastify-plugin'
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { join, resolve } from 'node:path'
import { createSubprocessRestarter, killSubprocessGroup } from '../lib/shutdown-subprocess.js'
import { YtDlpIpcClient, YtDlpIpcError } from '../lib/yt-dlp-ipc/client.js'

/**
 * @import { ChildProcessByStdio } from 'node:child_process'
 * @import { Duplex, Readable, Writable } from 'node:stream'
 * @import { JSONSchema } from 'json-schema-to-ts'
 */

export const ytDlpServerEnvSchema = /** @type {const} @satisfies {JSONSchema} */ ({
  properties: {
    YTDLPAPI_STARTUP_TIMEOUT_MS: {
      type: 'integer',
      default: 10000,
    },
    YTDLPAPI_REQUEST_TIMEOUT_MS: {
      type: 'integer',
      default: 120000,
    },
    YTDLPAPI_MAX_PENDING_REQUESTS: {
      type: 'integer',
      default: 100,
    },
  },
  required: [],
})

/**
 * This plugin manages one persistent yt-dlp Python IPC worker.
 */
export default fp(async function (fastify, _opts) {
  /** @type {YtDlpIpcClient | null} */
  let pythonClient = null
  let isShuttingDown = false
  const expectedExits = new WeakSet()
  let lifecycle = Promise.resolve()

  const spawnPythonWorker = async () => {
    if (isShuttingDown || pythonClient?.running) return

    const startedAt = performance.now()
    const projectRoot = resolve(import.meta.dirname, '..')
    const ytdlpServerDir = join(projectRoot, 'ytdlp-server')
    const venvPath = join(ytdlpServerDir, 'venv')
    const pythonPath = join(venvPath, 'bin', 'python')
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      VIRTUAL_ENV: venvPath,
      OBJC_DISABLE_INITIALIZE_FORK_SAFETY: 'YES',
    }

    fastify.log.info('Starting yt-dlp Python IPC worker')

    const spawnedChild = spawn(pythonPath, ['-u', '-m', 'ytdlp_worker'], {
      cwd: ytdlpServerDir,
      env,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    })
    const child = /** @type {ChildProcessByStdio<Writable, Readable, Readable>} */ (spawnedChild)
    const responseStream = /** @type {Duplex | null} */ (spawnedChild.stdio[3])
    if (!responseStream) {
      const signalSent = killSubprocessGroup(child, 'SIGKILL')
      fastify.log.error({
        pid: child.pid,
        signal: 'SIGKILL',
        signalSent,
      }, 'Force killed Python process group without an IPC response stream')
      throw new Error('Python IPC response stream was not created')
    }

    pipeLogs(child.stdout, 'info')
    pipeLogs(child.stderr, 'error')

    const client = new YtDlpIpcClient({
      child,
      responseStream,
      logger: fastify.log,
      startupTimeoutMs: fastify.config.YTDLPAPI_STARTUP_TIMEOUT_MS,
      requestTimeoutMs: fastify.config.YTDLPAPI_REQUEST_TIMEOUT_MS,
      maxPendingRequests: fastify.config.YTDLPAPI_MAX_PENDING_REQUESTS,
    })
    pythonClient = client

    child.once('exit', async (code, signal) => {
      const expected = isShuttingDown || expectedExits.has(child)
      fastify.log.info({
        pid: child.pid,
        code,
        signal,
        expected,
        service: 'yt-dlp-worker',
      }, expected ? 'Python IPC worker stopped' : 'Python IPC worker exited unexpectedly')

      if (pythonClient === client) pythonClient = null
      await restarter.handleExit({ expected })
    })

    await client.ready
    if (isShuttingDown) {
      expectedExits.add(child)
      await client.close()
      return
    }

    fastify.log.info({
      pid: child.pid,
      startupMs: Math.round(performance.now() - startedAt),
    }, 'yt-dlp Python IPC worker ready')
  }

  /**
   * @param {() => Promise<void>} operation
   */
  const runLifecycle = (operation) => {
    const result = lifecycle.then(operation, operation)
    lifecycle = result.catch(() => {})
    return result
  }

  const startPythonWorker = () => runLifecycle(spawnPythonWorker)

  const restarter = createSubprocessRestarter({
    start: startPythonWorker,
    logger: fastify.log,
    maxAttempts: 3,
    restartDelayMs: 1000,
  })

  fastify.addHook('onReady', async () => {
    try {
      await startPythonWorker()
    } catch (err) {
      fastify.log.error({ err }, 'Failed to start Python IPC worker')
      throw err
    }
  })

  fastify.addHook('onClose', async (instance) => {
    isShuttingDown = true
    restarter.shutdown()

    const client = pythonClient
    if (!client) return

    expectedExits.add(client.child)
    instance.log.info({ pid: client.pid }, 'Shutting down yt-dlp Python IPC worker')
    await client.close()
  })

  fastify.decorate('pythonServer', {
    get pid () { return pythonClient?.pid },
    get running () { return pythonClient?.running ?? false },
    info: async ({ url, format }) => {
      const client = pythonClient
      if (!client) throw unavailableError()
      return client.info({ url, format })
    },
    ytdlp: async () => {
      const client = pythonClient
      if (!client) throw unavailableError()
      return client.ytdlp()
    },
    restart: () => runLifecycle(async () => {
      const client = pythonClient
      if (client) {
        expectedExits.add(client.child)
        await client.close()
      }
      restarter.reset()
      await spawnPythonWorker()
    }),
  })

  /**
   * Forward line-buffered Python output through Fastify's structured logger.
   *
   * Python stdout is logged at info and stderr at error with the
   * `yt-dlp-worker` service field.
   * IPC responses use fd 3 and never pass through this logging path.
   * @param {Readable} stream
   * @param {'info' | 'error'} level
   */
  function pipeLogs (stream, level) {
    let buffered = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      buffered += chunk
      const lines = buffered.split('\n')
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) fastify.log[level]({ service: 'yt-dlp-worker' }, line)
      }
    })
    stream.on('end', () => {
      if (buffered.trim()) fastify.log[level]({ service: 'yt-dlp-worker' }, buffered)
    })
    stream.on('error', (err) => {
      fastify.log.error({
        err,
        service: 'yt-dlp-worker',
        stream: level === 'info' ? 'stdout' : 'stderr',
      }, 'Python worker log stream error')
    })
  }
}, {
  name: 'yt-dlp-server',
  dependencies: ['env'],
})

function unavailableError () {
  return new YtDlpIpcError('PYTHON_NOT_AVAILABLE', 'Python IPC worker is not available')
}
