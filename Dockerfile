FROM alpine:3.21

RUN apk add --no-cache python3 py3-pip nodejs npm git protobuf

WORKDIR /usr/src/app
COPY --link . .

# Set up Python Deps
WORKDIR /usr/src/app/ytdlp-server

ENV PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/usr/src/app/ytdlp-server/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN pip install --no-cache-dir -r requirements.txt

WORKDIR /usr/src/app

RUN npm i --omit=dev

EXPOSE 5000

CMD ["./node_modules/.bin/fastify", "start", "app.js"]
