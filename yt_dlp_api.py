from flask import Flask, jsonify, abort, request
from werkzeug.exceptions import HTTPException
from flask_basicauth import BasicAuth
from healthcheck import HealthCheck
import json
import yt_dlp

app = Flask(__name__)

app.config['BASIC_AUTH_USERNAME'] = 'user'
app.config['BASIC_AUTH_PASSWORD'] = 'pass'
app.config.from_prefixed_env()


basic_auth = BasicAuth(app)

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
        'service': 'yt-dlp-api'
    })


@app.route('/ytdlp', methods=['GET'])
@basic_auth.required
def authd():
    ydl_opts = {}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        URL = 'https://www.youtube.com/watch?v=BaW_jenozKc'
        info = ydl.extract_info(URL, download=False)
        return jsonify(ydl.sanitize_info(info))

@app.route('/info', methods=['GET'])
@basic_auth.required
def video_info():

    format_opts = request.args.get('format')
    if format_opts is None:
        abort(400)

    url = request.args.get('url')
    if url is None:
        abort(400)

    ydl_opts = {
        'format': format_opts,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        return jsonify(ydl.sanitize_info(info))



