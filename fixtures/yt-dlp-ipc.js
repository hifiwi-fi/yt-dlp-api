import fs from 'node:fs'
import { FrameDecoder, encodeFrame } from '../lib/yt-dlp-ipc/framed-json.js'

/**
 * Deterministic subprocess used to test the Node IPC client without starting
 * Python or making network requests.
 *
 * It mirrors the production framing contract: requests arrive on stdin and
 * responses are written to inherited file descriptor 3.
 * The command-line mode selects failure scenarios such as a startup protocol
 * error, an ignored request, a closed response channel, or an invalid envelope.
 */
const mode = process.argv[2] ?? 'normal'
const decoder = new FrameDecoder()

/**
 * Write one complete response frame synchronously so concurrent fixture timers
 * cannot interleave frame bytes.
 * @param {import('../lib/yt-dlp-ipc/framed-json.js').JsonValue} message
 */
function send (message) {
  fs.writeSync(3, encodeFrame(message))
}

if (mode === 'malformed-ready') {
  fs.writeSync(3, Buffer.from([0, 0, 0, 1, 123]))
} else {
  send({ type: 'ready', version: 1, pid: process.pid, concurrency: 2 })
}

if (mode === 'ignore') process.on('SIGTERM', () => {})
if (mode === 'close-response') setTimeout(() => fs.closeSync(3), 10)

process.stdin.on('data', (chunk) => {
  for (const message of decoder.push(chunk)) {
    if (typeof message !== 'object' || message === null || Array.isArray(message)) continue

    if (message.type === 'shutdown') {
      send({ type: 'drained', id: message.id ?? null })
      process.exit(0)
    }

    if (mode === 'ignore') continue
    if (mode === 'invalid-envelope') {
      send({ id: message.id ?? null })
      continue
    }

    const delay = message.params &&
      typeof message.params === 'object' &&
      !Array.isArray(message.params) &&
      typeof message.params.delay === 'number'
      ? message.params.delay
      : 0

    setTimeout(() => {
      send({
        id: message.id ?? null,
        result: {
          method: message.method ?? null,
          params: message.params ?? null,
        },
      })
    }, delay)
  }
})
