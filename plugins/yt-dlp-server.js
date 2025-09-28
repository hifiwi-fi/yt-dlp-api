import fp from 'fastify-plugin'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { join, resolve } from 'node:path'

/**
 * @import { ChildProcessByStdio } from 'node:child_process'
 * @import { Readable } from 'node:stream'
 */

/**
 * This plugin manages the yt-dlp Flask server as a subprocess
 */
export default fp(async function (fastify, _opts) {
  /** @type {ChildProcessByStdio<null, Readable, Readable> | null} */
  let pythonProcess = null
  let isShuttingDown = false
  let restartAttempts = 0
  const maxRestartAttempts = 3
  const restartDelay = 1000 // 1 second

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
      PATH: `${venvBinPath}:${process.env['PATH']}`
    }

    // Spawn gunicorn process
    pythonProcess = spawn(
      'gunicorn',
      [
        '-b', bindAddress,
        '--workers', '1',
        '--threads', '2',
        '--timeout', '120',
        '--graceful-timeout', '30',
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
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )

    // Handle stdout
    pythonProcess.stdout.on('data', (data) => {
      // @ts-expect-error
      const lines = data.toString().split('\n').filter(line => line.trim())
      // @ts-expect-error
      lines.forEach(line => {
        fastify.log.info({ service: 'yt-dlp-server' }, line)
      })
    })

    // Handle stderr
    pythonProcess.stderr.on('data', (data) => {
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
    pythonProcess.on('exit', async (code, signal) => {
      fastify.log.info({ code, signal, service: 'yt-dlp-server' }, 'Python server exited')
      pythonProcess = null

      // Attempt restart if not shutting down and within retry limits
      if (!isShuttingDown && restartAttempts < maxRestartAttempts) {
        restartAttempts++
        fastify.log.warn(
          { attempt: restartAttempts, maxAttempts: maxRestartAttempts },
          'Attempting to restart Python server'
        )

        // Wait before restarting
        await new Promise(resolve => setTimeout(resolve, restartDelay * restartAttempts))

        try {
          await startPythonServer()
          // Reset attempts on successful restart
          restartAttempts = 0
        } catch (err) {
          fastify.log.error({ err }, 'Failed to restart Python server')
        }
      } else if (restartAttempts >= maxRestartAttempts) {
        fastify.log.error('Maximum restart attempts reached for Python server')
      }
    })

    // Handle process errors
    pythonProcess.on('error', (err) => {
      fastify.log.error({ err, service: 'yt-dlp-server' }, 'Python server process error')
    })

    // Wait a bit for the server to start
    // In production, you might want to implement a proper health check
    await new Promise(resolve => setTimeout(resolve, 2000))

    fastify.log.info({ bindAddress }, 'yt-dlp Python server started')
  }

  // Start the Python server
  try {
    await startPythonServer()
  } catch (err) {
    fastify.log.error({ err }, 'Failed to start Python server')
    throw err
  }

  // Graceful shutdown
  fastify.addHook('onClose', async (instance) => {
    isShuttingDown = true

    if (pythonProcess) {
      instance.log.info('Shutting down yt-dlp Python server')

      // Send SIGTERM for graceful shutdown
      pythonProcess.kill('SIGTERM')

      try {
        // Wait for process to exit (with timeout)
        await Promise.race([
          once(pythonProcess, 'exit'),
          // eslint-disable-next-line promise/param-names
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Shutdown timeout')), 10000)
          )
        ])
      } catch (err) {
        // Force kill if graceful shutdown fails
        instance.log.warn('Force killing Python server due to shutdown timeout')
        pythonProcess.kill('SIGKILL')
      }
    }
  })

  // Decorate fastify with Python process info for debugging
  fastify.decorate('pythonServer', {
    get pid () { return pythonProcess?.pid },
    get running () { return pythonProcess !== null && !pythonProcess.killed },
    restart: async () => {
      if (pythonProcess) {
        pythonProcess.kill('SIGTERM')
        await once(pythonProcess, 'exit')
      }
      restartAttempts = 0
      await startPythonServer()
    }
  })
}, {
  name: 'yt-dlp-server',
  dependencies: ['env'],
})
