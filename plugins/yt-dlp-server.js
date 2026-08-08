import fp from 'fastify-plugin'
import { spawn } from 'node:child_process'

import { join, resolve } from 'node:path'
import { createSubprocessRestarter, shutdownSubprocess } from '../lib/shutdown-subprocess.js'

/**
 * @import { ChildProcessByStdio } from 'node:child_process'
 * @import { Readable } from 'node:stream'
 * @import { JSONSchema } from 'json-schema-to-ts'
 */

export const ytDlpServerEnvSchema = /** @type {const} @satisfies {JSONSchema} */ ({
  properties: {
    YTDLPAPI_HOST: {
      type: 'string',
      default: '127.0.0.1:3011'
    },
    YTDLPAPI_USER: {
      type: 'string',
      default: 'user'
    },
    YTDLPAPI_PASSWORD: {
      type: 'string',
      default: 'pass'
    },
  },
  required: [],
})

/**
 * This plugin manages the yt-dlp Flask server as a subprocess
 */
export default fp(async function (fastify, _opts) {
  /** @type {ChildProcessByStdio<null, Readable, Readable> | null} */
  let pythonProcess = null
  let isShuttingDown = false
  const expectedExits = new WeakSet()
  const gracefulShutdownTimeoutMs = 3000

  const startPythonServer = async () => {
    if (isShuttingDown) return

    const host = fastify.config.YTDLPAPI_HOST
    const [bindHost, bindPort] = host.split(':')
    const bindAddress = `${bindHost}:${bindPort}`

    fastify.log.info({ bindAddress }, 'Starting yt-dlp Python server')

    // Resolve paths relative to the plugin location
    const pluginDir = import.meta.dirname
    const projectRoot = resolve(pluginDir, '..')
    const ytdlpServerDir = join(projectRoot, 'ytdlp-server')
    const venvPath = join(ytdlpServerDir, 'venv')
    const venvBinPath = join(venvPath, 'bin')

    // Set up environment for the subprocess
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      VIRTUAL_ENV: venvPath,
      PATH: `${venvBinPath}:${process.env['PATH']}`,
      // Fix macOS fork() crash when Objective-C runtime is in use during fork
      OBJC_DISABLE_INITIALIZE_FORK_SAFETY: 'YES'
    }

    // Spawn gunicorn process
    pythonProcess = spawn(
      'gunicorn',
      [
        '-b', bindAddress,
        '--workers', '1',
        '--threads', '2',
        '--timeout', '120',
        '--graceful-timeout', '3',
        '--keep-alive', '5',
        '--log-level', 'info',
        '--access-logfile', '-',
        '--error-logfile', '-',
        '--capture-output',
        'yt_dlp_api:app'
      ],
      {
        cwd: ytdlpServerDir,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )

    const child = pythonProcess

    // Handle stdout
    child.stdout.on('data', (data) => {
      // @ts-expect-error
      const lines = data.toString().split('\n').filter(line => line.trim())
      // @ts-expect-error
      lines.forEach(line => {
        fastify.log.info({ service: 'yt-dlp-server' }, line)
      })
    })

    // Handle stderr
    child.stderr.on('data', (data) => {
      // @ts-expect-error
      const lines = data.toString().split('\n').filter(line => line.trim())
      // @ts-expect-error
      lines.forEach(line => {
        // Gunicorn logs info to stderr, so check the content
        if (line.includes('ERROR') || line.includes('CRITICAL')) {
          fastify.log.error({ service: 'yt-dlp-server' }, line)
        } else if (line.includes('WARNING')) {
          fastify.log.warn({ service: 'yt-dlp-server' }, line)
        } else {
          fastify.log.info({ service: 'yt-dlp-server' }, line)
        }
      })
    })

    // Handle process exit
    child.on('exit', async (code, signal) => {
      const expected = isShuttingDown || expectedExits.has(child)
      fastify.log.info({
        pid: child.pid,
        code,
        signal,
        expected,
        service: 'yt-dlp-server',
      }, expected ? 'Python server stopped' : 'Python server exited unexpectedly')

      if (pythonProcess === child) pythonProcess = null

      await restarter.handleExit({ expected })
    })

    // Handle process errors
    child.on('error', (err) => {
      fastify.log.error({ err, service: 'yt-dlp-server' }, 'Python server process error')
    })

    // Wait a bit for the server to start
    // In production, you might want to implement a proper health check
    await new Promise(resolve => setTimeout(resolve, 2000))

    fastify.log.info({ bindAddress }, 'yt-dlp Python server started')
  }

  const restarter = createSubprocessRestarter({
    start: startPythonServer,
    logger: fastify.log,
    maxAttempts: 3,
    restartDelayMs: 1000,
  })

  // Start only after every plugin has loaded so a later startup failure cannot
  // orphan a Python process before shutdown hooks become active.
  fastify.addHook('onReady', async () => {
    try {
      await startPythonServer()
    } catch (err) {
      fastify.log.error({ err }, 'Failed to start Python server')
      throw err
    }
  })

  // Graceful shutdown
  fastify.addHook('onClose', async (instance) => {
    isShuttingDown = true

    restarter.shutdown()

    const child = pythonProcess
    if (!child) return

    expectedExits.add(child)
    instance.log.info({ pid: child.pid }, 'Shutting down yt-dlp Python server')
    await shutdownSubprocess({
      child,
      logger: instance.log,
      gracefulTimeoutMs: gracefulShutdownTimeoutMs,
    })
  })

  // Decorate fastify with Python process info for debugging
  fastify.decorate('pythonServer', {
    get pid () { return pythonProcess?.pid },
    get running () {
      return pythonProcess !== null &&
        pythonProcess.exitCode === null &&
        pythonProcess.signalCode === null
    },
    restart: async () => {
      const child = pythonProcess
      if (child) {
        expectedExits.add(child)
        await shutdownSubprocess({
          child,
          logger: fastify.log,
          gracefulTimeoutMs: gracefulShutdownTimeoutMs,
        })
      }
      restarter.reset()
      await startPythonServer()
    }
  })
}, {
  name: 'yt-dlp-server',
  dependencies: ['env'],
})
