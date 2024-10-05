from flask import Flask, jsonify, abort, request
from werkzeug.exceptions import HTTPException
from healthcheck import HealthCheck
import json
import yt_dlp

# This is just a prototype

app = Flask(__name__)

app.config.from_prefixed_env()


health = HealthCheck()


# add your own check function to the healthcheck
def app_available():
    return True, "app ok"


health.add_check(app_available)


app.add_url_rule("/health", "healthcheck", view_func=health.run)


@app.errorhandler(HTTPException)
def handle_exception(e):
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
def hello():
    return jsonify({
        'message': 'Hello world!',
        'service': 'ytdlp-python-server'
    })


@app.route('/ytdlp', methods=['GET'])
def authd():
    ydl_opts = {}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        URL = 'https://www.youtube.com/watch?v=BaW_jenozKc'
        info = ydl.extract_info(URL, download=False)
        return jsonify(ydl.sanitize_info(info))


@app.route('/info', methods=['GET'])
def video_info():

    format_opts = request.args.get('format')
    if format_opts is None:
        abort(400, 'format querystring required')

    url = request.args.get('url')
    if url is None:
        abort(400, 'url querystring required')

    ydl_opts = {
        'ignore_no_formats_error': True,
        'format': format_opts,
        'noplaylist': True
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
            return jsonify(ydl.sanitize_info(info))
        except Exception as e:
            abort(500, str(e))
