## Python worker

The Python process is a persistent internal `yt-dlp` worker owned by the Fastify plugin.
It does not listen on a TCP port and is not intended to be started independently.

Node writes four-byte big-endian length-prefixed JSON requests to the worker's stdin.
Python writes framed JSON responses to inherited file descriptor 3.
Stdout and stderr are reserved for logs so library output cannot corrupt the protocol.

The worker imports `yt-dlp` before emitting its ready frame and handles extraction work with two threads.
Fastify correlates responses by request ID, applies bounded queue and request deadlines, and restarts the process after a fatal transport failure or hard extraction timeout.

Shutdown is cooperative: Fastify sends a shutdown control frame, Python stops intake, drains active work, emits a drained frame, and exits with code 0.
Fastify retains a bounded `SIGTERM` and process-group `SIGKILL` fallback.

## Setup

Python setup is integrated into the top-level install and clean scripts.

```console
python3 -m venv venv
source venv/bin/activate
pip3 install -r requirements.txt
```

## Tests

Run the standard-library Python tests from the repository root.

```console
PYTHONPATH=ytdlp-server ytdlp-server/venv/bin/python -m unittest discover -s ytdlp-server/tests -p 'test_*.py'
```

Run Pyright from the repository root.

```console
pnpm pyright -p ytdlp-server
```
