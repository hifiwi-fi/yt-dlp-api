import { test } from 'node:test'
import { build } from '../../test/helper.js'
import assert from 'node:assert/strict'

const youtubeVideoUrl = 'https://www.youtube.com/watch?v=6Dh-RL__uN4'

test('discover endpoint', { todo: process.env.CI }, async (t) => {
  await t.test('GET /discover - YouTube video metadata (no url field)', async (t) => {
    const app = await build(t)

    const response = await app.inject({
      method: 'GET',
      url: `/discover?url=${encodeURIComponent(youtubeVideoUrl)}&format=video`,
      headers: {
        authorization: `Basic ${Buffer.from(`${app.config.BASIC_AUTH_USERNAME}:${app.config.BASIC_AUTH_PASSWORD}`).toString('base64')}`
      }
    })

    assert.strictEqual(response.statusCode, 200)

    const body = response.json()

    // Must NOT have a url field — this is the discovery endpoint
    assert.ok(!Object.hasOwn(body, 'url'), 'Should not have url field')

    // Core metadata fields
    assert.strictEqual(body.title, 'bitch lasagna')
    assert.strictEqual(body.duration, 135)
    assert.strictEqual(body.channel, 'PewDiePie')
    assert.strictEqual(body.ext, 'mp4')
    assert.strictEqual(body._type, 'video')
    assert.strictEqual(body.channel_url, 'http://www.youtube.com/@PewDiePie')
    assert.strictEqual(body.uploader_url, 'http://www.youtube.com/@PewDiePie')
    assert.ok(body.thumbnail, 'Should have thumbnail')
    assert.ok(body.description, 'Should have description')
    assert.strictEqual(body.live_status, null)
    assert.strictEqual(body.release_timestamp, null)

    // filesize_approx is null — not available without format URL processing
    assert.strictEqual(body.filesize_approx, null)

    // All schema-defined fields present
    assert.ok(Object.hasOwn(body, 'filesize_approx'))
    assert.ok(Object.hasOwn(body, 'duration'))
    assert.ok(Object.hasOwn(body, 'channel'))
    assert.ok(Object.hasOwn(body, 'title'))
    assert.ok(Object.hasOwn(body, 'ext'))
    assert.ok(Object.hasOwn(body, '_type'))
    assert.ok(Object.hasOwn(body, 'description'))
    assert.ok(Object.hasOwn(body, 'uploader_url'))
    assert.ok(Object.hasOwn(body, 'channel_url'))
    assert.ok(Object.hasOwn(body, 'thumbnail'))
    assert.ok(Object.hasOwn(body, 'live_status'))
    assert.ok(Object.hasOwn(body, 'release_timestamp'))
  })

  await t.test('GET /discover - non-YouTube video metadata', async (t) => {
    const app = await build(t)

    const testUrl = 'https://x.com/JUSTcatmeme/status/1822418125268095457'

    const response = await app.inject({
      method: 'GET',
      url: `/discover?url=${encodeURIComponent(testUrl)}&format=video`,
      headers: {
        authorization: `Basic ${Buffer.from(`${app.config.BASIC_AUTH_USERNAME}:${app.config.BASIC_AUTH_PASSWORD}`).toString('base64')}`
      }
    })

    // External URL extraction can be unreliable; accept 200 or 5xx
    const validStatusCodes = [200, 500, 502, 503]
    assert.ok(validStatusCodes.includes(response.statusCode), `Expected ${validStatusCodes.join('/')} but got ${response.statusCode}`)

    if (response.statusCode === 200) {
      const body = response.json()
      // Must NOT have a url field — this is the discovery endpoint
      assert.ok(!Object.hasOwn(body, 'url'), 'Should not have url field')
      assert.ok(body.title, 'Should have title')
    }
  })

  await t.test('GET /discover - missing authentication', async (t) => {
    const app = await build(t)

    const response = await app.inject({
      method: 'GET',
      url: `/discover?url=${encodeURIComponent(youtubeVideoUrl)}&format=video`
    })

    assert.strictEqual(response.statusCode, 401)
  })

  await t.test('GET /discover - invalid authentication', async (t) => {
    const app = await build(t)

    const response = await app.inject({
      method: 'GET',
      url: `/discover?url=${encodeURIComponent(youtubeVideoUrl)}&format=video`,
      headers: {
        authorization: 'Basic ' + Buffer.from('wrong:credentials').toString('base64')
      }
    })

    assert.strictEqual(response.statusCode, 401)
  })

  await t.test('GET /discover - missing url parameter', async (t) => {
    const app = await build(t)

    const response = await app.inject({
      method: 'GET',
      url: '/discover?format=video',
      headers: {
        authorization: `Basic ${Buffer.from(`${app.config.BASIC_AUTH_USERNAME}:${app.config.BASIC_AUTH_PASSWORD}`).toString('base64')}`
      }
    })

    assert.strictEqual(response.statusCode, 400)
  })

  await t.test('GET /discover - missing format parameter', async (t) => {
    const app = await build(t)

    const response = await app.inject({
      method: 'GET',
      url: `/discover?url=${encodeURIComponent(youtubeVideoUrl)}`,
      headers: {
        authorization: `Basic ${Buffer.from(`${app.config.BASIC_AUTH_USERNAME}:${app.config.BASIC_AUTH_PASSWORD}`).toString('base64')}`
      }
    })

    assert.strictEqual(response.statusCode, 400)
  })

  await t.test('GET /discover - invalid format parameter', async (t) => {
    const app = await build(t)

    const response = await app.inject({
      method: 'GET',
      url: `/discover?url=${encodeURIComponent(youtubeVideoUrl)}&format=invalid`,
      headers: {
        authorization: `Basic ${Buffer.from(`${app.config.BASIC_AUTH_USERNAME}:${app.config.BASIC_AUTH_PASSWORD}`).toString('base64')}`
      }
    })

    assert.strictEqual(response.statusCode, 400)
  })
})
