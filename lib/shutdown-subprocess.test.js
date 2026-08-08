import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { EventEmitter, once } from 'node:events'
import { test } from 'node:test'
import { createSubprocessRestarter, shutdownSubprocess } from './shutdown-subprocess.js'

const fixturePath = new URL('../fixtures/subprocess.js', import.meta.url)
const logger = {
  info () {},
  warn () {},
  error () {},
}

/**
 * @param {import('node:test').TestContext} t
 * @param {'graceful' | 'ignore' | 'exit'} mode
 */
async function startFixture (t, mode) {
  const child = fork(fixturePath, [mode], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
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

  if (mode !== 'exit') await once(child, 'message')
  return child
}

test('gracefully shuts down a subprocess after SIGTERM', async (t) => {
  const child = await startFixture(t, 'graceful')
  const baselineExitListeners = child.listenerCount('exit')

  const result = await shutdownSubprocess({
    child,
    logger,
    gracefulTimeoutMs: 500,
  })

  assert.equal(result.code, 0)
  assert.equal(result.signal, null)
  assert.equal(result.forceKillRequired, false)
  assert.equal(child.listenerCount('exit'), baselineExitListeners)
})

test('force kills the subprocess group after the graceful timeout', async (t) => {
  const child = await startFixture(t, 'ignore')

  const result = await shutdownSubprocess({
    child,
    logger,
    gracefulTimeoutMs: 25,
  })

  assert.equal(result.code, null)
  assert.equal(result.signal, 'SIGKILL')
  assert.equal(result.forceKillRequired, true)
})

test('handles a subprocess that exits before or during shutdown setup', async (t) => {
  const child = await startFixture(t, 'exit')
  await once(child, 'exit')

  const result = await shutdownSubprocess({
    child,
    logger,
    gracefulTimeoutMs: 25,
  })

  assert.equal(result.code, 0)
  assert.equal(result.forceKillRequired, false)
})

test('handles exit while kill returns false', async () => {
  const fakeChild = new EventEmitter()
  Object.assign(fakeChild, {
    pid: undefined,
    exitCode: null,
    signalCode: null,
    kill () {
      fakeChild.exitCode = 0
      fakeChild.emit('exit', 0, null)
      return false
    },
  })

  const result = await shutdownSubprocess({
    child: /** @type {import('node:child_process').ChildProcess} */ (/** @type {unknown} */ (fakeChild)),
    logger,
    gracefulTimeoutMs: 25,
  })

  assert.equal(result.code, 0)
  assert.equal(result.forceKillRequired, false)
  assert.equal(fakeChild.listenerCount('exit'), 0)
})

test('restarts after an unexpected exit but not an expected shutdown', async () => {
  let starts = 0
  const restarter = createSubprocessRestarter({
    start: async () => { starts++ },
    logger,
    maxAttempts: 3,
    restartDelayMs: 0,
  })

  await restarter.handleExit({ expected: true })
  assert.equal(starts, 0)

  await restarter.handleExit({ expected: false })
  assert.equal(starts, 1)
})

test('cancels a pending unexpected-exit restart during shutdown', async () => {
  let starts = 0
  const restarter = createSubprocessRestarter({
    start: async () => { starts++ },
    logger,
    maxAttempts: 3,
    restartDelayMs: 1000,
  })

  const restart = restarter.handleExit({ expected: false })
  restarter.shutdown()
  await restart

  assert.equal(starts, 0)
})

test('coalesces repeated shutdown calls', async (t) => {
  const child = await startFixture(t, 'graceful')

  const firstShutdown = shutdownSubprocess({
    child,
    logger,
    gracefulTimeoutMs: 500,
  })
  const secondShutdown = shutdownSubprocess({
    child,
    logger,
    gracefulTimeoutMs: 500,
  })

  assert.equal(firstShutdown, secondShutdown)
  const [firstResult, secondResult] = await Promise.all([firstShutdown, secondShutdown])
  assert.deepEqual(firstResult, secondResult)
})
