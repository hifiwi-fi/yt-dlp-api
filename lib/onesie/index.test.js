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
  console.log({ statusCode })
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
  console.log({ url: result.url })
  // Replace these with actual expected values
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
  // Byte-range validation with user-agent
  if (!process.env['CI']) {
    await sleep(3000)
    const byteRangeData = await testByteRange(await result.url)
    console.log('Byte-range check passed:', byteRangeData.byteLength, 'bytes received')
  } else {
    console.log('Skipping byte-range check in CI environment')
  }
})

/** @param {number} ms */
async function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

test('release_timestamp format - Unix seconds', async (t) => {
  await t.test('Date object conversion to Unix seconds', () => {
    // Simulate what YouTube.js returns
    const mockYouTubeJsBasicInfo = {
      start_timestamp: new Date('2024-01-15T10:30:00Z') // Date object
    }

    // Our fix: Convert Date to Unix timestamp in SECONDS
    const correctConversion = mockYouTubeJsBasicInfo.start_timestamp
      ? Math.floor(mockYouTubeJsBasicInfo.start_timestamp.getTime() / 1000)
      : null

    console.log('Unix timestamp (seconds):', correctConversion)
    assert.strictEqual(correctConversion, 1705314600)

    // Verify that breadcrum.net can correctly convert it back (seconds * 1000 = milliseconds)
    const breadcrumConversion = new Date(correctConversion * 1000)
    console.log('Result after breadcrum.net conversion:', breadcrumConversion.toISOString())
    
    // Should match the original date
    assert.strictEqual(breadcrumConversion.toISOString(), '2024-01-15T10:30:00.000Z')
    assert.strictEqual(breadcrumConversion.getFullYear(), 2024)
  })

  await t.test('Demonstrates bug when Date is not converted', () => {
    // What would happen if we didn't convert Date to Unix seconds
    const mockDate = new Date('2024-01-15T10:30:00Z')
    const timestampMs = mockDate.getTime() // This is in milliseconds: 1705314600000
    
    // If breadcrum.net receives this and multiplies by 1000
    const incorrectMultiplication = timestampMs * 1000
    console.log('Incorrectly multiplied:', incorrectMultiplication)
    
    const resultingDate = new Date(incorrectMultiplication)
    console.log('Resulting date:', resultingDate.toISOString())
    
    // This produces a date in the far future (year 56000+)
    assert.ok(resultingDate.getFullYear() > 50000, 'Year should be astronomical without proper conversion')
  })

  await t.test('Reverse engineer the actual error from production', () => {
    // The error message shows: "+058080-04-27T07:36:40.000Z"
    // This helps us understand what timestamp value caused the issue
    
    const errorDate = new Date('+058080-04-27T07:36:40.000Z')
    const errorTimestamp = errorDate.getTime()
    console.log('Timestamp that produces year 58080:', errorTimestamp)
    
    // Divide by 1000 to get the original value before breadcrum.net's multiplication
    const originalValue = errorTimestamp / 1000
    console.log('Original value before *1000:', originalValue)
    
    // This is milliseconds, so convert to a date
    const originalDate = new Date(originalValue)
    console.log('Original date:', originalDate.toISOString())
    console.log('Original year:', originalDate.getFullYear())
    
    // The original date is in a reasonable year (2026), confirming the bug:
    // The API was returning milliseconds, breadcrum.net multiplied by 1000 again
    assert.ok(originalDate.getFullYear() >= 2024 && originalDate.getFullYear() <= 2030, 
      'Original date should be in reasonable range')
  })
})
