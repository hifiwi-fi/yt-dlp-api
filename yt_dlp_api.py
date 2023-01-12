from flask import Flask, jsonify
from flask_basicauth import BasicAuth
from healthcheck import HealthCheck

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


@app.route('/authd', methods=['GET'])
@basic_auth.required
def authd(name=None):
    return jsonify({
        'message': 'Hello auth!'
    })
