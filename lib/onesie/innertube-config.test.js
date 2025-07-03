import * as assert from 'node:assert'
import { test } from 'node:test'
import { InnertubeConfig } from './innertube-config.js'

test('InnertubeConfig - creates instance with default config', async (_t) => {
  const config = new InnertubeConfig()

  assert.strictEqual(config.refreshMs, 1000 * 60 * 60 * 48, 'Default refresh time should be 48 hours')
  assert.strictEqual(config.innertube, null, 'Innertube should be null initially')
  assert.strictEqual(config.lastUpdated, null, 'lastUpdated should be null initially')
})

test('InnertubeConfig - creates instance with custom refresh time', async (_t) => {
  const customRefreshMs = 1000 * 60 * 60 // 1 hour
  const config = new InnertubeConfig({ refreshMs: customRefreshMs })

  assert.strictEqual(config.refreshMs, customRefreshMs, 'Custom refresh time should be set')
})

test('InnertubeConfig - getInnertube creates new instance on first call', async (_t) => {
  const config = new InnertubeConfig()

  const innertube = await config.getInnertube()

  assert.ok(innertube, 'Innertube instance should be created')
  assert.ok(config.lastUpdated instanceof Date, 'lastUpdated should be set to a Date')
  assert.strictEqual(config.innertube, innertube, 'Innertube should be cached')
})

test('InnertubeConfig - getInnertube returns cached instance before refresh time', async (_t) => {
  const config = new InnertubeConfig({ refreshMs: 1000 * 60 * 60 }) // 1 hour

  const firstInstance = await config.getInnertube()
  const secondInstance = await config.getInnertube()

  assert.strictEqual(firstInstance, secondInstance, 'Should return the same cached instance')
})

test('InnertubeConfig - concurrent requests return same instance', async (_t) => {
  const config = new InnertubeConfig()

  // Make multiple concurrent requests
  const [instance1, instance2, instance3] = await Promise.all([
    config.getInnertube(),
    config.getInnertube(),
    config.getInnertube()
  ])

  assert.strictEqual(instance1, instance2, 'All instances should be the same')
  assert.strictEqual(instance2, instance3, 'All instances should be the same')
})

test('InnertubeConfig - refreshes instance after refresh time', async (_t) => {
  // Use a very short refresh time for testing
  const config = new InnertubeConfig({ refreshMs: 100 }) // 100ms

  const firstInstance = await config.getInnertube()
  const firstUpdateTime = config.lastUpdated

  // Wait for refresh time to pass
  await new Promise(resolve => setTimeout(resolve, 150))

  const secondInstance = await config.getInnertube()
  const secondUpdateTime = config.lastUpdated

  assert.notStrictEqual(firstInstance, secondInstance, 'Should create a new instance after refresh time')
  assert.notStrictEqual(firstUpdateTime?.getTime(), secondUpdateTime?.getTime(), 'lastUpdated should be different')
})
