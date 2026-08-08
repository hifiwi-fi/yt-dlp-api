from __future__ import annotations

import io
import os
import struct
import threading
import unittest
from collections.abc import Callable
from types import TracebackType
from typing import cast

from ytdlp_worker import extraction, ipc


type JsonValue = extraction.JsonValue


class ChunkedBytesIO(io.BytesIO):
    def read(self, size: int = -1) -> bytes:
        if size < 0:
            size = 2
        return super().read(min(size, 2))


class MockYoutubeDL:
    def __init__(
        self,
        options: extraction.YoutubeDLOptions,
        result: object,
        extract_hook: Callable[[], None] | None = None,
    ) -> None:
        self.options = dict(options)
        self.result = result
        self.extract_hook = extract_hook
        self.extracted: list[tuple[str, bool]] = []

    def __enter__(self) -> MockYoutubeDL:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        return None

    def extract_info(self, url: str, *, download: bool) -> object:
        self.extracted.append((url, download))
        if self.extract_hook is not None:
            self.extract_hook()
        return self.result

    def sanitize_info(self, info: object) -> object:
        return info


class RecordingFactory:
    def __init__(
        self,
        result: object,
        extract_hook: Callable[[], None] | None = None,
    ) -> None:
        self.result = result
        self.extract_hook = extract_hook
        self.instances: list[MockYoutubeDL] = []
        self.lock = threading.Lock()

    def __call__(
        self,
        options: extraction.YoutubeDLOptions,
    ) -> MockYoutubeDL:
        instance = MockYoutubeDL(options, self.result, self.extract_hook)
        with self.lock:
            self.instances.append(instance)
        return instance


class FailingYoutubeDL(MockYoutubeDL):
    def extract_info(self, url: str, *, download: bool) -> object:
        raise RuntimeError("extraction failed")


class FailingFactory:
    def __call__(
        self,
        options: extraction.YoutubeDLOptions,
    ) -> FailingYoutubeDL:
        return FailingYoutubeDL(options, {})


def framed(*messages: JsonValue) -> io.BytesIO:
    return io.BytesIO(b"".join(ipc.encode_frame(message) for message in messages))


def ready_response() -> dict[str, JsonValue]:
    return {
        "type": "ready",
        "version": 1,
        "pid": os.getpid(),
        "concurrency": 2,
    }


def decoded_frames(stream: io.BytesIO) -> list[JsonValue]:
    stream.seek(0)
    messages: list[JsonValue] = []
    while True:
        try:
            messages.append(ipc.read_frame(stream))
        except EOFError:
            return messages


class FrameTests(unittest.TestCase):
    def test_reads_chunked_length_prefixed_json(self) -> None:
        message: JsonValue = {
            "id": 7,
            "method": "info",
            "params": {"url": "https://example.com/video", "format": "bestaudio"},
        }
        stream = ChunkedBytesIO(ipc.encode_frame(message))

        self.assertEqual(ipc.read_frame(stream), message)

    def test_rejects_truncated_and_invalid_frames(self) -> None:
        with self.assertRaisesRegex(ipc.FrameError, "cannot be empty"):
            ipc.read_frame(io.BytesIO(struct.pack(">I", 0)))

        with self.assertRaisesRegex(ipc.FrameError, "unexpected EOF"):
            ipc.read_frame(io.BytesIO(struct.pack(">I", 10) + b"{}"))

        with self.assertRaisesRegex(ipc.FrameError, "invalid JSON"):
            ipc.read_frame(io.BytesIO(struct.pack(">I", 1) + b"{"))


class WorkerTests(unittest.TestCase):
    def test_extraction_error_is_returned_and_eof_drains(self) -> None:
        input_stream = framed({
            "id": "request-1",
            "method": "info",
            "params": {
                "url": "https://example.com/video",
                "format": "bestvideo",
            },
        })
        output_stream = io.BytesIO()

        exit_code = ipc.run_worker(
            input_stream,
            output_stream,
            FailingFactory(),
        )

        self.assertEqual(exit_code, 0)
        self.assertEqual(decoded_frames(output_stream), [
            ready_response(),
            {
                "id": "request-1",
                "error": {
                    "type": "RuntimeError",
                    "message": "extraction failed",
                },
            },
            {"type": "drained"},
        ])

    def test_shutdown_stops_intake_and_drains_both_workers(self) -> None:
        release = threading.Event()
        both_started = threading.Event()
        start_lock = threading.Lock()
        started = 0

        def wait_for_release() -> None:
            nonlocal started
            with start_lock:
                started += 1
                if started == 2:
                    both_started.set()
            if not release.wait(2):
                raise TimeoutError("test did not release extraction")

        factory = RecordingFactory({"ok": True}, extract_hook=wait_for_release)
        input_stream = framed(
            {"id": 1, "method": "ytdlp"},
            {"id": 2, "method": "ytdlp"},
            {"id": "shutdown-1", "type": "shutdown"},
            {"id": 3, "method": "ytdlp"},
        )
        output_stream = io.BytesIO()
        result: list[int] = []

        worker = threading.Thread(
            target=lambda: result.append(
                ipc.run_worker(input_stream, output_stream, factory)
            )
        )
        worker.start()
        self.assertTrue(both_started.wait(1), "both executor workers did not start")
        self.assertTrue(worker.is_alive(), "worker did not wait for active tasks")

        release.set()
        worker.join(2)
        self.assertFalse(worker.is_alive(), "worker did not drain and exit")
        self.assertEqual(result, [0])

        responses = decoded_frames(output_stream)
        self.assertEqual(responses[0], ready_response())
        self.assertEqual(responses[-1], {"type": "drained", "id": "shutdown-1"})
        task_responses = cast(list[dict[str, JsonValue]], responses[1:-1])
        response_ids = [cast(int, response["id"]) for response in task_responses]
        self.assertCountEqual(response_ids, [1, 2])
        self.assertEqual(
            [response["result"] for response in task_responses],
            [{"ok": True}, {"ok": True}],
        )
        self.assertEqual(len(factory.instances), 2)


if __name__ == "__main__":
    unittest.main()
