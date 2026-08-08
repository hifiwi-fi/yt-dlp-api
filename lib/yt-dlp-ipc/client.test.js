import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { test } from 'node:test'
import { YtDlpIpcClient } from './client.js'

const fixturePath = new URL('../../fixtures/yt-dlp-ipc.js', import.meta.url)
const logger = {
  info () {},
  warn () {},
  error () {},
}

/**
 * @param {import('node:test').TestContext} t
 * @param {string} [mode]
 * @param {Object} [options]
 * @param {number} [options.requestTimeoutMs]
 */
async function startClient (t, mode = 'normal', { requestTimeoutMs = 500 } = {}) {
  const child = spawn(process.execPath, [fixturePath.pathname, mode], {
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
  })
  const responseStream = /** @type {import('node:stream').Duplex} */ (child.stdio[3])
  if (!child.stdin || !child.stdout || !child.stderr || !responseStream) {
    throw new Error('IPC fixture streams were not created')
  }

  const client = new YtDlpIpcClient({
    child: /** @type {import('node:child_process').ChildProcessByStdio<import('node:stream').Writable, import('node:stream').Readable, import('node:stream').Readable>} */ (child),
    responseStream,
    logger,
    startupTimeoutMs: 500,
    requestTimeoutMs,
    maxPendingRequests: 4,
  })

  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-(child.pid ?? 0), 'SIGKILL')
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ESRCH') throw err
      }
      await once(child, 'exit')
    }
  })

  await client.ready
  return client
}

test('waits for ready and correlates concurrent out-of-order responses', async (t) => {
  const client = await startClient(t)

  const slow = client.request('info', { url: 'https://example.com/slow', delay: 25 })
  const fast = client.request('info', { url: 'https://example.com/fast', delay: 0 })
  const [slowResponse, fastResponse] = await Promise.all([slow, fast])

  assert.equal(slowResponse.statusCode, 200)
  assert.deepEqual(slowResponse.body, {
    method: 'info',
    params: { url: 'https://example.com/slow', delay: 25 },
  })
  assert.deepEqual(fastResponse.body, {
    method: 'info',
    params: { url: 'https://example.com/fast', delay: 0 },
  })

  await client.close()
  assert.equal(client.child.exitCode, 0)
})

test('rejects requests and terminates an unhealthy worker after timeout', async (t) => {
  const client = await startClient(t, 'ignore', { requestTimeoutMs: 20 })

  await assert.rejects(
    client.request('info', { url: 'https://example.com', format: 'best' }),
    { code: 'PYTHON_REQUEST_TIMEOUT' }
  )

  await once(client.child, 'exit')
  assert.equal(client.child.signalCode, 'SIGKILL')
})

test('terminates the worker when the response channel closes', async (t) => {
  const client = await startClient(t, 'close-response')
  await waitForExit(client.child)

  assert.equal(client.running, false)
})

test('rejects malformed response envelopes and terminates the worker', async (t) => {
  const client = await startClient(t, 'invalid-envelope')

  await assert.rejects(
    client.request('info', { url: 'https://example.com', format: 'best' }),
    { code: 'PYTHON_PROTOCOL_ERROR' }
  )
  await waitForExit(client.child)
  assert.equal(client.running, false)
})

test('rejects startup when the worker sends a malformed frame', async (t) => {
  const child = spawn(process.execPath, [fixturePath.pathname, 'malformed-ready'], {
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
  })
  const responseStream = /** @type {import('node:stream').Duplex} */ (child.stdio[3])
  if (!child.stdin || !child.stdout || !child.stderr || !responseStream) {
    throw new Error('IPC fixture streams were not created')
  }

  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  })

  const client = new YtDlpIpcClient({
    child: /** @type {import('node:child_process').ChildProcessByStdio<import('node:stream').Writable, import('node:stream').Readable, import('node:stream').Readable>} */ (child),
    responseStream,
    logger,
    startupTimeoutMs: 500,
    requestTimeoutMs: 500,
    maxPendingRequests: 4,
  })

  await assert.rejects(client.ready)
})

/**
 * @param {import('node:child_process').ChildProcess} child
 */
function waitForExit (child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return once(child, 'exit').then(() => {})
}
