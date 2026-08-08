"""Domain logic for extracting and normalizing yt-dlp metadata."""

from __future__ import annotations

from importlib import import_module
from types import TracebackType
from typing import Mapping, Protocol, cast
from urllib.parse import urlparse


type JsonScalar = str | int | float | bool | None
type JsonValue = dict[str, JsonValue] | list[JsonValue] | JsonScalar
type YoutubeDLOptions = Mapping[str, object]

TEST_VIDEO_URL = "https://www.youtube.com/watch?v=BaW_jenozKc"
URL_FIELD_NAMES: frozenset[str] = frozenset({"thumbnail", "url"})


class YoutubeDLInstance(Protocol):
    """Minimal YoutubeDL instance interface used by production and test factories."""

    def __enter__(self) -> YoutubeDLInstance:
        """Enter the YoutubeDL resource-management context."""
        ...

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool | None:
        """Close resources when leaving the YoutubeDL context."""
        ...

    def extract_info(self, url: str, *, download: bool) -> object:
        """Extract metadata for a URL without requiring a media download."""
        ...

    def sanitize_info(self, info: object) -> object:
        """Convert yt-dlp's internal result into JSON-compatible data."""
        ...


class YoutubeDLFactory(Protocol):
    """Callable interface for constructing configured YoutubeDL instances."""

    def __call__(self, options: YoutubeDLOptions) -> YoutubeDLInstance:
        """Create one isolated YoutubeDL instance for an extraction request."""
        ...


def get_youtube_dl_factory() -> YoutubeDLFactory:
    """Import yt-dlp lazily and return its YoutubeDL constructor."""
    module = import_module("yt_dlp")
    factory = getattr(module, "YoutubeDL")
    return cast(YoutubeDLFactory, factory)


def is_url_field(key: str) -> bool:
    """Identify response fields whose values must be valid absolute URIs."""
    return key in URL_FIELD_NAMES or key.endswith("_url")


def normalize_ytdlp_uri(value: JsonValue) -> str | None:
    """Keep valid absolute URIs and replace missing or relative values with null."""
    if not value or not isinstance(value, str):
        return None

    parsed = urlparse(value)
    if not parsed.scheme:
        return None

    if parsed.scheme in {"http", "https"} and not parsed.netloc:
        return None

    return value


def normalize_ytdlp_response(
    value: JsonValue,
    key: str | None = None,
) -> JsonValue:
    """Recursively normalize every URL-like field in a sanitized yt-dlp result."""
    if isinstance(value, dict):
        return {
            nested_key: normalize_ytdlp_response(nested_value, nested_key)
            for nested_key, nested_value in value.items()
        }

    if isinstance(value, list):
        return [normalize_ytdlp_response(item, key) for item in value]

    if key is not None and is_url_field(key):
        return normalize_ytdlp_uri(value)

    return value


def extract_info(
    url: str,
    format_name: str,
    youtube_dl_factory: YoutubeDLFactory | None = None,
) -> JsonValue:
    """Resolve one URL and format into sanitized, normalized media metadata."""
    factory = youtube_dl_factory or get_youtube_dl_factory()
    options: YoutubeDLOptions = {
        "ignore_no_formats_error": True,
        "format": format_name,
        "noplaylist": True,
    }

    with factory(options) as ydl:
        info = ydl.extract_info(url, download=False)
        sanitized = cast(JsonValue, ydl.sanitize_info(info))
        return normalize_ytdlp_response(sanitized)


def extract_test_video(
    youtube_dl_factory: YoutubeDLFactory | None = None,
) -> JsonValue:
    """Run the compatibility endpoint against yt-dlp's canonical test video."""
    factory = youtube_dl_factory or get_youtube_dl_factory()
    with factory({}) as ydl:
        info = ydl.extract_info(TEST_VIDEO_URL, download=False)
        return cast(JsonValue, ydl.sanitize_info(info))
