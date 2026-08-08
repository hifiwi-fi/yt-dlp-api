import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import Fastify from 'fastify'
import fp from 'fastify-plugin'
import ytDlpServerPlugin from './yt-dlp-server.js'

/**
 * @import { DotEnvSchemaType } from '../config/env-schema.js'
 */

test('serializes concurrent restarts and retains exactly one Python worker', async (t) => {
  const app = Fastify({ logger: false })
  app.register(fp(async function TestEnv (fastify) {
    fastify.decorate('config', /** @type {DotEnvSchemaType} */ (/** @type {unknown} */ ({
      YTDLPAPI_STARTUP_TIMEOUT_MS: 2000,
      YTDLPAPI_REQUEST_TIMEOUT_MS: 2000,
      YTDLPAPI_MAX_PENDING_REQUESTS: 4,
    })))
  }, { name: 'env' }))
  app.register(ytDlpServerPlugin)

  t.after(async () => {
    await app.close()
  })

  await app.ready()
  const initialPid = app.pythonServer.pid
  assert.equal(app.pythonServer.running, true)
  assert.equal(countPythonWorkers(), 1)

  await Promise.all([
    app.pythonServer.restart(),
    app.pythonServer.restart(),
  ])

  assert.equal(app.pythonServer.running, true)
  assert.notEqual(app.pythonServer.pid, initialPid)
  assert.equal(countPythonWorkers(), 1)

  await app.close()
  assert.equal(countPythonWorkers(), 0)
})

function countPythonWorkers () {
  const processList = execFileSync('ps', ['-axo', 'ppid=,command='], { encoding: 'utf8' })
  return processList.split('\n').filter((line) => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/)
    return match &&
      Number(match[1]) === process.pid &&
      match[2].includes('-m ytdlp_worker')
  }).length
}
