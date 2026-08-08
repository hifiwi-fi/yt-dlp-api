from __future__ import annotations

import os
import sys

from .extraction import get_youtube_dl_factory
from .ipc import run_worker


def main() -> int:
    try:
        response_stream = os.fdopen(3, "wb", buffering=0, closefd=False)
    except OSError as error:
        print(f"unable to open IPC response fd 3: {error}", file=sys.stderr)
        return 1

    try:
        youtube_dl_factory = get_youtube_dl_factory()
        return run_worker(sys.stdin.buffer, response_stream, youtube_dl_factory)
    except BrokenPipeError:
        print("IPC response pipe closed", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"yt-dlp worker failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
