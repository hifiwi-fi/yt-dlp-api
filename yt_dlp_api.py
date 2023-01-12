from flask import Flask, jsonify
from flask_basicauth import BasicAuth

app = Flask(__name__)

app.config['BASIC_AUTH_USERNAME'] = 'user'
app.config['BASIC_AUTH_PASSWORD'] = 'pass'

basic_auth = BasicAuth(app)


@app.route('/', methods=['GET'])
def hello(name=None):
    return jsonify({
        'message': 'Hello world!',
        'service': 'yt-dlp-api'
    })


@app.route('/authd', methods=['GET'])
@basic_auth.required
def authd(name=None):
    return jsonify({
        'message': 'Hello auth!'
    })
