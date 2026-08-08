from __future__ import annotations

import threading
import unittest
from collections.abc import Callable
from types import TracebackType

from ytdlp_worker import extraction


class MockYoutubeDL:
    def __init__(
        self,
        options: extraction.YoutubeDLOptions,
        result: object,
        sanitizer: Callable[[object], object] | None = None,
        extract_hook: Callable[[], None] | None = None,
    ) -> None:
        self.options = dict(options)
        self.result = result
        self.sanitizer = sanitizer or (lambda value: value)
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
        return self.sanitizer(info)


class RecordingFactory:
    def __init__(
        self,
        result: object,
        sanitizer: Callable[[object], object] | None = None,
        extract_hook: Callable[[], None] | None = None,
    ) -> None:
        self.result = result
        self.sanitizer = sanitizer
        self.extract_hook = extract_hook
        self.instances: list[MockYoutubeDL] = []
        self.lock = threading.Lock()

    def __call__(
        self,
        options: extraction.YoutubeDLOptions,
    ) -> MockYoutubeDL:
        instance = MockYoutubeDL(
            options,
            self.result,
            self.sanitizer,
            self.extract_hook,
        )
        with self.lock:
            self.instances.append(instance)
        return instance


class ExtractionTests(unittest.TestCase):
    def test_info_preserves_options_and_normalizes_url_fields(self) -> None:
        factory = RecordingFactory(
            {
                "url": "https://media.example/audio",
                "thumbnail": "not-a-url",
                "webpage_url": "https://example.com/watch/1",
                "title": "Episode",
                "formats": [{"url": "data:audio/test"}, {"url": "relative"}],
            }
        )

        result = extraction.extract_info(
            "https://example.com/watch/1",
            "bestaudio",
            factory,
        )

        self.assertEqual(factory.instances[0].options, {
            "ignore_no_formats_error": True,
            "format": "bestaudio",
            "noplaylist": True,
        })
        self.assertEqual(
            factory.instances[0].extracted,
            [("https://example.com/watch/1", False)],
        )
        self.assertEqual(result, {
            "url": "https://media.example/audio",
            "thumbnail": None,
            "webpage_url": "https://example.com/watch/1",
            "title": "Episode",
            "formats": [{"url": "data:audio/test"}, {"url": None}],
        })

    def test_ytdlp_uses_existing_test_video(self) -> None:
        factory = RecordingFactory({"id": "BaW_jenozKc"})

        result = extraction.extract_test_video(factory)

        self.assertEqual(result, {"id": "BaW_jenozKc"})
        self.assertEqual(factory.instances[0].options, {})
        self.assertEqual(
            factory.instances[0].extracted,
            [(extraction.TEST_VIDEO_URL, False)],
        )


if __name__ == "__main__":
    unittest.main()
