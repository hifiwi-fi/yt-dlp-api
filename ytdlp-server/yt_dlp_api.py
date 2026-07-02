from flask import Flask, Response, jsonify, abort, request
from healthcheck import HealthCheck
from typing import TYPE_CHECKING, TypedDict, cast
from urllib.parse import urlparse
from werkzeug.exceptions import HTTPException
from werkzeug.wrappers import Response as WerkzeugResponse
import json
import yt_dlp

if TYPE_CHECKING:
    from yt_dlp.YoutubeDL import _Params

# This is just a prototype

type YtDlpValue = dict[str, YtDlpValue] | list[YtDlpValue] | str | int | float | bool | None


class YtDlpOptions(TypedDict, total=False):
    ignore_no_formats_error: bool
    format: str
    noplaylist: bool


app = Flask(__name__)

app.config.from_prefixed_env()


health = HealthCheck()


# add your own check function to the healthcheck
def app_available() -> tuple[bool, str]:
    return True, "app ok"


health.add_check(app_available)


URL_FIELD_NAMES: frozenset[str] = frozenset({"thumbnail", "url"})


def is_url_field(key: str) -> bool:
    return key in URL_FIELD_NAMES or key.endswith("_url")


def normalize_ytdlp_uri(value: YtDlpValue) -> str | None:
    if not value or not isinstance(value, str):
        return None

    parsed = urlparse(value)
    if not parsed.scheme:
        return None

    if parsed.scheme in {"http", "https"} and not parsed.netloc:
        return None

    return value


def normalize_ytdlp_response(value: YtDlpValue, key: str | None = None) -> YtDlpValue:
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


app.add_url_rule("/health", "healthcheck", view_func=health.run)


@app.errorhandler(HTTPException)
def handle_exception(e: HTTPException) -> WerkzeugResponse:
    """Return JSON instead of HTML for HTTP errors."""
    # start with the correct headers and status code from the error
    response = e.get_response()
    # replace the body with JSON
    response.data = json.dumps({
        "code": e.code,
        "name": e.name,
        "description": e.description,
    })
    response.content_type = "application/json"
    return response


@app.route('/', methods=['GET'])
def hello() -> Response:
    return jsonify({
        'message': 'Hello world!',
        'service': 'ytdlp-python-server'
    })


@app.route('/ytdlp', methods=['GET'])
def authd() -> Response:
    ydl_opts: YtDlpOptions = {}
    with yt_dlp.YoutubeDL(cast('_Params', ydl_opts)) as ydl:
        URL = 'https://www.youtube.com/watch?v=BaW_jenozKc'
        info = ydl.extract_info(URL, download=False)
        return jsonify(ydl.sanitize_info(info))


@app.route('/info', methods=['GET'])
def video_info() -> Response:
    """
    Full media extraction for non-YouTube URLs. Resolves the actual streamable media URL
    for the requested format. This is the slow path — used only at playback time via the
    podcast feed redirect, not during episode creation.

    For YouTube, the Node.js layer handles this via the Onesie protocol (encrypted tunnel
    to YouTube's initplayback endpoint) to work around YouTube's server-side restrictions.
    """

    format_opts = request.args.get('format')
    if format_opts is None:
        abort(400, 'format querystring required')

    url = request.args.get('url')
    if url is None:
        abort(400, 'url querystring required')

    ydl_opts: YtDlpOptions = {
        'ignore_no_formats_error': True,  # return partial info even if no downloadable formats found
        'format': format_opts,            # e.g. 'bestaudio' or 'bestvideo' — selects which stream URL to return
        'noplaylist': True                # treat URL as a single video, not a playlist
    }

    with yt_dlp.YoutubeDL(cast('_Params', ydl_opts)) as ydl:
        try:
            # process=True (default): full format resolution, returns signed media URL in info['url']
            info = ydl.extract_info(url, download=False)
            sanitized_info = cast(YtDlpValue, ydl.sanitize_info(info))
            return jsonify(normalize_ytdlp_response(sanitized_info))
        except Exception as e:
            abort(500, str(e))
