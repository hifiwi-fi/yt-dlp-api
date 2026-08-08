import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encodeFrame, FrameDecoder, FrameError } from './framed-json.js'

test('decodes a frame split across header and payload chunks', () => {
  const frame = encodeFrame({ id: 'one', value: 'payload' })
  const decoder = new FrameDecoder()

  assert.deepEqual(decoder.push(frame.subarray(0, 2)), [])
  assert.deepEqual(decoder.push(frame.subarray(2, 7)), [])
  assert.deepEqual(decoder.push(frame.subarray(7)), [{ id: 'one', value: 'payload' }])
  decoder.finish()
})

test('decodes multiple frames from one chunk', () => {
  const decoder = new FrameDecoder()
  const chunk = Buffer.concat([
    encodeFrame({ id: 1 }),
    encodeFrame({ id: 2 }),
  ])

  assert.deepEqual(decoder.push(chunk), [{ id: 1 }, { id: 2 }])
})

test('rejects empty, oversized, malformed, and partial frames', () => {
  assert.throws(
    () => new FrameDecoder().push(Buffer.alloc(4)),
    /payload cannot be empty/
  )

  const oversizedHeader = Buffer.alloc(4)
  oversizedHeader.writeUInt32BE(9, 0)
  assert.throws(
    () => new FrameDecoder({ maxFrameSize: 8 }).push(oversizedHeader),
    /exceeds 8 byte limit/
  )

  const invalidJson = Buffer.concat([Buffer.from([0, 0, 0, 1]), Buffer.from('{')])
  assert.throws(() => new FrameDecoder().push(invalidJson), FrameError)

  const partialDecoder = new FrameDecoder()
  partialDecoder.push(encodeFrame({ id: 1 }).subarray(0, 5))
  assert.throws(() => partialDecoder.finish(), /partial frame/)
})
