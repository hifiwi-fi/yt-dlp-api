import { test } from 'node:test'
import { build } from '../../test/helper.js'
import assert from 'node:assert/strict'

const youtubeVideoUrl = 'https://www.youtube.com/watch?v=6Dh-RL__uN4'

test('unified yt-dlp endpoint', { todo: process.env.CI }, async (t) => {
  await t.test('GET /unified - X.com video extraction', async (t) => {
    const app = await build(t)

    const testUrl = 'https://x.com/JUSTcatmeme/status/1822418125268095457'
    const format = 'video'

    const response = await app.inject({
      method: 'GET',
      url: `/unified?url=${encodeURIComponent(testUrl)}&format=${format}`,
      headers: {
        authorization: `Basic ${Buffer.from(`${app.config.BASIC_AUTH_USERNAME}:${app.config.BASIC_AUTH_PASSWORD}`).toString('base64')}`
      }
    })

    assert.strictEqual(response.statusCode, 200, 'Should return 200 status')

    const body = response.json()

    // Verify required fields exist
    assert.ok(body.url, 'Should have url field')
    assert.strictEqual(typeof body.url, 'string', 'url should be a string')

    // Verify optional fields have correct types when present
    if (body.title !== null) {
      assert.strictEqual(typeof body.title, 'string', 'title should be a string when present')
    }

    if (body.duration !== null) {
      assert.strictEqual(typeof body.duration, 'number', 'duration should be a number when present')
    }

    if (body.filesize_approx !== null) {
      assert.strictEqual(typeof body.filesize_approx, 'number', 'filesize_approx should be a number when present')
    }

    if (body.ext !== null) {
      assert.strictEqual(typeof body.ext, 'string', 'ext should be a string when present')
    }

    if (body.thumbnail !== null) {
      assert.strictEqual(typeof body.thumbnail, 'string', 'thumbnail should be a string when present')
    }

    if (body.description !== null) {
      assert.strictEqual(typeof body.description, 'string', 'description should be a string when present')
    }

    // Verify schema-defined fields are present (even if null)
    assert.ok(Object.hasOwn(body, 'url'), 'Should have url property')
    assert.ok(Object.hasOwn(body, 'filesize_approx'), 'Should have filesize_approx property')
    assert.ok(Object.hasOwn(body, 'duration'), 'Should have duration property')
    assert.ok(Object.hasOwn(body, 'title'), 'Should have title property')
    assert.ok(Object.hasOwn(body, 'ext'), 'Should have ext property')
    assert.ok(Object.hasOwn(body, '_type'), 'Should have _type property')
    assert.ok(Object.hasOwn(body, 'description'), 'Should have description property')
    assert.ok(Object.hasOwn(body, 'uploader_url'), 'Should have uploader_url property')
    assert.ok(Object.hasOwn(body, 'thumbnail'), 'Should have thumbnail property')
  })

  await t.test('GET /unified - YouTube video extraction', async (t) => {
    const app = await build(t)

    const format = 'video'

    const response = await app.inject({
      method: 'GET',
      url: `/unified?url=${encodeURIComponent(youtubeVideoUrl)}&format=${format}`,
      headers: {
        authorization: `Basic ${Buffer.from(`${app.config.BASIC_AUTH_USERNAME}:${app.config.BASIC_AUTH_PASSWORD}`).toString('base64')}`
      }
    })

    assert.strictEqual(response.statusCode, 200, 'Should return 200 status')

    const body = response.json()

    // Verify required fields exist
    assert.ok(body.url, 'Should have url field')
    assert.strictEqual(typeof body.url, 'string', 'url should be a string')

    // Verify expected YouTube metadata
    assert.strictEqual(body.title, 'bitch lasagna', 'Should have correct title')
    assert.strictEqual(body.duration, 135, 'Should have correct duration')
    assert.strictEqual(body.channel, 'PewDiePie', 'Should have correct channel')
    assert.strictEqual(body.ext, 'mp4', 'Should have mp4 extension')
    assert.strictEqual(body._type, 'video', 'Should have video type')
    assert.strictEqual(body.channel_url, 'http://www.youtube.com/@PewDiePie', 'Should have correct channel URL')
    assert.strictEqual(body.uploader_url, 'http://www.youtube.com/@PewDiePie', 'Should have correct uploader URL')
    assert.ok(body.description, 'Should have description')
    assert.ok(body.thumbnail, 'Should have thumbnail')
    assert.strictEqual(body.live_status, null, 'Should have null live_status for regular video')
    assert.strictEqual(body.release_timestamp, null, 'Should have null release_timestamp for regular video')
  })

  await t.test('GET /unified - missing authentication', async (t) => {
    const app = await build(t)

    const testUrl = 'https://x.com/JUSTcatmeme/status/1822418125268095457'
    const format = 'video'

    const response = await app.inject({
      method: 'GET',
      url: `/unified?url=${encodeURIComponent(testUrl)}&format=${format}`
    })

    assert.strictEqual(response.statusCode, 401, 'Should return 401 without authentication')
  })

  await t.test('GET /unified - invalid authentication', async (t) => {
    const app = await build(t)

    const testUrl = 'https://x.com/JUSTcatmeme/status/1822418125268095457'
    const format = 'video'

    const response = await app.inject({
      method: 'GET',
      url: `/unified?url=${encodeURIComponent(testUrl)}&format=${format}`,
      headers: {
        authorization: 'Basic ' + Buffer.from('wrong:credentials').toString('base64')
      }
    })

    assert.strictEqual(response.statusCode, 401, 'Should return 401 with invalid credentials')
  })

  await t.test('GET /unified - missing url parameter', async (t) => {
    const app = await build(t)

    const response = await app.inject({
      method: 'GET',
      url: '/unified?format=video',
      headers: {
        authorization: `Basic ${Buffer.from(`${app.config.BASIC_AUTH_USERNAME}:${app.config.BASIC_AUTH_PASSWORD}`).toString('base64')}`
      }
    })

    assert.strictEqual(response.statusCode, 400, 'Should return 400 when url is missing')
  })

  await t.test('GET /unified - missing format parameter', async (t) => {
    const app = await build(t)

    const testUrl = 'https://x.com/JUSTcatmeme/status/1822418125268095457'

    const response = await app.inject({
      method: 'GET',
      url: `/unified?url=${encodeURIComponent(testUrl)}`,
      headers: {
        authorization: `Basic ${Buffer.from(`${app.config.BASIC_AUTH_USERNAME}:${app.config.BASIC_AUTH_PASSWORD}`).toString('base64')}`
      }
    })

    assert.strictEqual(response.statusCode, 400, 'Should return 400 when format is missing')
  })

  await t.test('GET /unified - invalid format parameter', async (t) => {
    const app = await build(t)

    const testUrl = 'https://x.com/JUSTcatmeme/status/1822418125268095457'

    const response = await app.inject({
      method: 'GET',
      url: `/unified?url=${encodeURIComponent(testUrl)}&format=invalid`,
      headers: {
        authorization: `Basic ${Buffer.from(`${app.config.BASIC_AUTH_USERNAME}:${app.config.BASIC_AUTH_PASSWORD}`).toString('base64')}`
      }
    })

    assert.strictEqual(response.statusCode, 400, 'Should return 400 when format is invalid')
  })
})
