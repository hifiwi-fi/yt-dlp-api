import * as assert from 'node:assert'
import { test } from 'node:test'
import { request } from 'undici'
import Innertube, { UniversalCache } from 'youtubei.js'
import { onesieFormatRequest } from './index.js'
import { YouTubeTVClientConfig } from './tv-config.js'

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
  const statusOk = statusCode === 206 || statusCode === 200
  assert.ok(statusOk, 'Correct status code received')

  const buf = await res.body.arrayBuffer()
  assert.ok(buf.byteLength > 0, 'No data received')
  assert.ok(buf.byteLength <= byteLength, 'Received more data than requested')

  return buf
}

test('onesieFormatRequest test', async (_t) => {
  const innertube = await Innertube.create({ cache: new UniversalCache(true) })
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
  await sleep(3000)
  const byteRangeData = await testByteRange(result.url)
  console.log('Byte-range check passed:', byteRangeData.byteLength, 'bytes received')
})

/** @param {number} ms */
async function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
