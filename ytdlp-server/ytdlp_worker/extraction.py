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
    def __enter__(self) -> YoutubeDLInstance: ...

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool | None: ...

    def extract_info(self, url: str, *, download: bool) -> object: ...

    def sanitize_info(self, info: object) -> object: ...


class YoutubeDLFactory(Protocol):
    def __call__(self, options: YoutubeDLOptions) -> YoutubeDLInstance: ...


def get_youtube_dl_factory() -> YoutubeDLFactory:
    module = import_module("yt_dlp")
    factory = getattr(module, "YoutubeDL")
    return cast(YoutubeDLFactory, factory)


def is_url_field(key: str) -> bool:
    return key in URL_FIELD_NAMES or key.endswith("_url")


def normalize_ytdlp_uri(value: JsonValue) -> str | None:
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
    factory = youtube_dl_factory or get_youtube_dl_factory()
    with factory({}) as ydl:
        info = ydl.extract_info(TEST_VIDEO_URL, download=False)
        return cast(JsonValue, ydl.sanitize_info(info))
