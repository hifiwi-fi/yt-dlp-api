import * as assert from 'node:assert'
import { test } from 'node:test'
import pino from 'pino'
import { getBasicInfoMetadata, extractYouTubeVideoId } from './index.js'
import { YouTubeTVClientConfig } from './tv-config.js'
import Innertube from 'youtubei.js'
// import { onesiePoolEnvSchema } from '#plugins/onesie-pool.js'
// const defaultPlayerId = onesiePoolEnvSchema.properties.YOUTUBE_PLAYER_ID.default

const videoUrl = 'https://www.youtube.com/watch?v=6Dh-RL__uN4'
/** @type {import('fastify').FastifyBaseLogger} */
const logger = pino({ enabled: false })

// Live YouTube metadata extraction does not pass reliably in CI.
test('getBasicInfoMetadata test', { todo: process.env.CI }, async (_t) => {
  const innertube = await Innertube.create({ retrieve_innertube_config: true })
  const tvConfigInstance = new YouTubeTVClientConfig()

  const result = await getBasicInfoMetadata(videoUrl, 'video', innertube, tvConfigInstance, logger)

  // Core metadata — same values as onesieFormatRequest
  assert.strictEqual(result.title, 'bitch lasagna')
  assert.strictEqual(result.duration, 135)
  assert.strictEqual(result.channel, 'PewDiePie')
  assert.strictEqual(result.channel_url, 'http://www.youtube.com/@PewDiePie')
  assert.strictEqual(result.uploader_url, 'http://www.youtube.com/@PewDiePie')
  assert.strictEqual(result.ext, 'mp4')
  assert.strictEqual(result._type, 'video')
  assert.ok(result.thumbnail, 'Should have a thumbnail URL')
  assert.ok(result.description, 'Should have a description')
  assert.strictEqual(result.live_status, null, 'Regular video should have null live_status')
  assert.strictEqual(result.release_timestamp, null, 'Regular video should have null release_timestamp')

  // Discovery-specific: no url, no filesize_approx
  assert.strictEqual(result.filesize_approx, null, 'filesize_approx should be null without format processing')
  assert.ok(!Object.hasOwn(result, 'url'), 'Should not have url field in discovery result')
})

test('extractYouTubeVideoId', async (t) => {
  await t.test('standard watch URL (youtube.com/watch?v=ID)', () => {
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/watch?v=abc123'), 'abc123')
    assert.strictEqual(extractYouTubeVideoId('https://youtube.com/watch?v=abc123'), 'abc123')
    assert.strictEqual(extractYouTubeVideoId('https://m.youtube.com/watch?v=abc123'), 'abc123')
  })

  await t.test('short URL (youtu.be/ID)', () => {
    assert.strictEqual(extractYouTubeVideoId('https://youtu.be/abc123'), 'abc123')
    assert.strictEqual(extractYouTubeVideoId('https://youtu.be/abc123?si=sometoken'), 'abc123')
  })

  await t.test('YouTube Shorts (youtube.com/shorts/ID)', () => {
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/shorts/abc123'), 'abc123')
  })

  await t.test('embed URL (youtube.com/embed/ID)', () => {
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/embed/abc123'), 'abc123')
    assert.strictEqual(extractYouTubeVideoId('https://youtube-nocookie.com/embed/abc123'), 'abc123')
  })

  await t.test('live URL (youtube.com/live/ID)', () => {
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/live/abc123'), 'abc123')
  })

  await t.test('returns null for unrecognized YouTube URL shapes', () => {
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/channel/UCabc123'), null)
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/@SomeChannel'), null)
  })
})

test('release_timestamp format - Unix seconds', async (t) => {
  await t.test('Converts Date object to Unix seconds correctly', () => {
    // Simulate what YouTube.js returns (Date object)
    const mockYouTubeJsBasicInfo = {
      start_timestamp: new Date('2024-01-15T10:30:00Z')
    }

    // Convert Date to Unix timestamp in SECONDS (as expected by yt-dlp API format)
    const unixSeconds = mockYouTubeJsBasicInfo.start_timestamp
      ? Math.floor(mockYouTubeJsBasicInfo.start_timestamp.getTime() / 1000)
      : null

    assert.strictEqual(unixSeconds, 1705314600)

    // Verify breadcrum.net can correctly convert it back (seconds * 1000 = milliseconds)
    const breadcrumConversion = new Date(unixSeconds * 1000)
    assert.strictEqual(breadcrumConversion.toISOString(), '2024-01-15T10:30:00.000Z')
    assert.strictEqual(breadcrumConversion.getFullYear(), 2024)
  })

  await t.test('Fails without proper Unix seconds conversion', () => {
    // What happens if Date.getTime() milliseconds are sent without conversion
    const mockDate = new Date('2024-01-15T10:30:00Z')
    const timestampMs = mockDate.getTime() // Milliseconds: 1705314600000

    // If breadcrum.net receives milliseconds and multiplies by 1000
    const incorrectResult = new Date(timestampMs * 1000)

    // This produces a date in the far future (year 56000+)
    assert.ok(incorrectResult.getFullYear() > 50000, 'Should produce astronomical year without proper conversion')
  })
})
