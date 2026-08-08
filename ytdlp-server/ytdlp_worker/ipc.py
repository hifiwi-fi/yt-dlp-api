"""Framed IPC protocol and concurrent request dispatcher for the yt-dlp worker."""

from __future__ import annotations

import json
import os
import struct
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from typing import BinaryIO, cast

from .extraction import (
    JsonValue,
    YoutubeDLFactory,
    extract_info,
    extract_test_video,
)


type Request = dict[str, JsonValue]

FRAME_HEADER_SIZE = 4
MAX_FRAME_SIZE = 64 * 1024 * 1024
WORKER_CONCURRENCY = 2


class FrameError(ValueError):
    """Raised when an IPC frame cannot be decoded."""


class RequestError(ValueError):
    """Raised when an IPC request is invalid."""


def read_exactly(stream: BinaryIO, size: int) -> bytes:
    """Read an exact byte count or distinguish clean EOF from a truncated frame."""
    chunks: list[bytes] = []
    remaining = size

    while remaining:
        chunk = stream.read(remaining)
        if not chunk:
            if remaining == size:
                raise EOFError
            raise FrameError("unexpected EOF in frame")
        chunks.append(chunk)
        remaining -= len(chunk)

    return b"".join(chunks)


def read_frame(stream: BinaryIO) -> JsonValue:
    """Decode one length-prefixed JSON value from a binary request stream."""
    header = read_exactly(stream, FRAME_HEADER_SIZE)
    (length,) = struct.unpack(">I", header)
    if length == 0:
        raise FrameError("frame payload cannot be empty")
    if length > MAX_FRAME_SIZE:
        raise FrameError(f"frame exceeds {MAX_FRAME_SIZE} byte limit")

    payload = read_exactly(stream, length)
    try:
        decoded = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise FrameError(f"invalid JSON frame: {error}") from error

    return cast(JsonValue, decoded)


def encode_frame(value: JsonValue) -> bytes:
    """Serialize one JSON value with a four-byte big-endian length prefix."""
    payload = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    if len(payload) > MAX_FRAME_SIZE:
        raise FrameError(f"frame exceeds {MAX_FRAME_SIZE} byte limit")
    return struct.pack(">I", len(payload)) + payload


def write_frame(stream: BinaryIO, value: JsonValue) -> None:
    """Write and flush one complete frame to the dedicated response channel."""
    stream.write(encode_frame(value))
    stream.flush()


def request_id(request: Request) -> JsonValue:
    """Return the correlation identifier copied into the matching response."""
    return request.get("id")


def request_parameters(request: Request) -> Request:
    """Extract and validate the optional request parameter object."""
    parameters = request.get("params")
    if parameters is None:
        return request
    if not isinstance(parameters, dict):
        raise RequestError("params must be an object")
    return parameters


def required_string(parameters: Request, name: str) -> str:
    """Read one required non-empty string parameter or raise a request error."""
    value = parameters.get(name)
    if not isinstance(value, str) or not value:
        raise RequestError(f"{name} must be a non-empty string")
    return value


def handle_request(
    request: Request,
    youtube_dl_factory: YoutubeDLFactory | None = None,
) -> JsonValue:
    """Dispatch a validated IPC method to the corresponding extraction function."""
    method = request.get("method")
    if method == "info":
        parameters = request_parameters(request)
        return extract_info(
            required_string(parameters, "url"),
            required_string(parameters, "format"),
            youtube_dl_factory,
        )
    if method == "ytdlp":
        return extract_test_video(youtube_dl_factory)
    raise RequestError("method must be 'info' or 'ytdlp'")


def success_response(identifier: JsonValue, result: JsonValue) -> Request:
    """Build the success envelope expected by the Node request correlator."""
    return {"id": identifier, "result": result}


def error_response(identifier: JsonValue, error: BaseException) -> Request:
    """Convert an extraction or validation exception into a response envelope."""
    return {
        "id": identifier,
        "error": {
            "type": type(error).__name__,
            "message": str(error),
        },
    }


def lifecycle_response(message_type: str, identifier: JsonValue = None) -> Request:
    """Build a worker lifecycle message, optionally correlated to a control request."""
    response: Request = {"type": message_type}
    if identifier is not None:
        response["id"] = identifier
    return response


def is_shutdown_message(request: Request) -> bool:
    """Recognize both supported forms of the cooperative shutdown command."""
    return request.get("method") == "shutdown" or request.get("type") == "shutdown"


def run_worker(
    input_stream: BinaryIO,
    response_stream: BinaryIO,
    youtube_dl_factory: YoutubeDLFactory | None = None,
) -> int:
    """Read requests, run up to two extractions concurrently, then drain on shutdown."""
    write_lock = Lock()

    def send(response: JsonValue) -> None:
        """Serialize response writes so executor threads cannot interleave frames."""
        with write_lock:
            write_frame(response_stream, response)

    def process(request: Request) -> None:
        """Execute one request and convert all application failures into envelopes."""
        identifier = request_id(request)
        try:
            result = handle_request(request, youtube_dl_factory)
            send(success_response(identifier, result))
        except Exception as error:
            send(error_response(identifier, error))

    shutdown_id: JsonValue = None
    send({
        "type": "ready",
        "version": 1,
        "pid": os.getpid(),
        "concurrency": WORKER_CONCURRENCY,
    })

    with ThreadPoolExecutor(
        max_workers=WORKER_CONCURRENCY,
        thread_name_prefix="ytdlp",
    ) as executor:
        while True:
            try:
                message = read_frame(input_stream)
            except EOFError:
                break
            except FrameError:
                raise

            if not isinstance(message, dict):
                send(error_response(None, RequestError("request must be an object")))
                continue

            if is_shutdown_message(message):
                shutdown_id = request_id(message)
                break

            executor.submit(process, message)

    send(lifecycle_response("drained", shutdown_id))
    return 0
