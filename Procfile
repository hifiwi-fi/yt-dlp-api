fastify: ./node_modules/.bin/fastify start app.js
ytdlp-api: cd ./ytdlp-server && gunicorn -b "${YTDLPAPI_HOST:-127.0.0.1:5001}" yt_dlp_api:app
