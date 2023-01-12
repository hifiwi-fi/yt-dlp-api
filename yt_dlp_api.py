from flask import Flask, jsonify
from flask_basicauth import BasicAuth
from healthcheck import HealthCheck
import json
import yt_dlp

app = Flask(__name__)

app.config['BASIC_AUTH_USERNAME'] = 'user'
app.config['BASIC_AUTH_PASSWORD'] = 'pass'

basic_auth = BasicAuth(app)

health = HealthCheck()


# add your own check function to the healthcheck
def app_available():
    return True, "app ok"


health.add_check(app_available)


app.add_url_rule("/health", "healthcheck", view_func=health.run)


@app.route('/', methods=['GET'])
def hello(name=None):
    return jsonify({
        'message': 'Hello world!',
        'service': 'yt-dlp-api'
    })


@app.route('/ytdlp', methods=['GET'])
@basic_auth.required
def authd(name=None):
    ydl_opts = {}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        URL = 'https://www.youtube.com/watch?v=BaW_jenozKc'
        info = ydl.extract_info(URL, download=False)
        return jsonify(ydl.sanitize_info(info))
