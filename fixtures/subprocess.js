const mode = process.argv[2]
const keepAlive = setInterval(() => {}, 1000)

if (mode === 'graceful') {
  process.on('SIGTERM', () => {
    clearInterval(keepAlive)
    process.exit(0)
  })
} else if (mode === 'ignore') {
  process.on('SIGTERM', () => {})
} else if (mode === 'exit') {
  clearInterval(keepAlive)
  process.exit(0)
} else {
  throw new Error(`Unknown subprocess fixture mode: ${mode}`)
}

if (process.send) process.send({ ready: true })
