import * as assert from 'node:assert'
import { test } from 'node:test'
import { request } from 'undici'
import { onesieFormatRequest } from './index.js'
import { YouTubeTVClientConfig } from './tv-config.js'
import Innertube from 'youtubei.js'
// import { schema } from '../../plugins/env.js'
// const defaultPlayerId = schema.properties.YOUTUBE_PLAYER_ID.default

const videoUrl = 'https://www.youtube.com/watch?v=6Dh-RL__uN4'

/**
 * Requests a small byte range from the URL and ensures the response is valid.
 * @param {string} url
 * @param {number} byteLength
 */
async function testByteRange (url, byteLength = 128) {
  const res = await request(url, {
    headers: {
      Range: `bytes=0-${byteLength - 1}`
    }
  })

  const statusCode = res.statusCode
  const statusOk = statusCode === 206 || statusCode === 200 || statusCode === 302
  assert.ok(statusOk, 'Correct status code received')

  const buf = await res.body.arrayBuffer()
  assert.ok(buf.byteLength > 0, 'No data received')
  assert.ok(buf.byteLength <= byteLength, 'Received more data than requested')

  return buf
}

test('onesieFormatRequest test', async (_t) => {
  const innertube = await Innertube.create({ /* player_id: defaultPlayerId , */ retrieve_innertube_config: false })
  const tvConfigInstance = new YouTubeTVClientConfig()

  const result = await onesieFormatRequest(videoUrl, 'video', innertube, tvConfigInstance)

  assert.strictEqual(result.title, 'bitch lasagna')
  assert.strictEqual(result.duration, 135)
  assert.strictEqual(result.filesize_approx, null)
  assert.strictEqual(result.channel, 'PewDiePie')
  assert.strictEqual(result.description, '► Spotify: https://spoti.fi/2RO79mu \n► iTunes: https://apple.co/2DhMiDM \n\nTrack made by Party In Backyard ►https://www.youtube.com/channel/UCIaIVpEocfuQ9fhBT1rsKrQ\nEdit & shot by: fakemarzia\n\nFeel free to use this track (within reason), it won\'t be claimed.')
  assert.strictEqual(result.channel_url, 'http://www.youtube.com/@PewDiePie')
  assert.strictEqual(result.uploader_url, 'http://www.youtube.com/@PewDiePie')
  assert.strictEqual(result.ext, 'mp4')
  assert.strictEqual(result._type, 'video')
  assert.strictEqual(result.thumbnail, 'https://i.ytimg.com/vi/6Dh-RL__uN4/maxresdefault.jpg?sqp=-oaymwEmCIAKENAF8quKqQMa8AEB-AH-CYAC0AWKAgwIABABGGUgZShlMA8=&rs=AOn4CLBXOoO3qXbP1I0O8kPbh44gIDrjuQ')
  assert.ok(result.url)
  assert.strictEqual(result.live_status, null)
  assert.strictEqual(result.release_timestamp, null)

  // Byte-range validation (skip in CI to avoid rate limits)
  if (!process.env['CI']) {
    await sleep(3000)
    await testByteRange(await result.url)
  }
})

/** @param {number} ms */
async function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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
