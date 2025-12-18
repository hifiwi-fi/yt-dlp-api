FROM alpine:3.22

RUN apk add --no-cache python3 py3-pip nodejs git protobuf pnpm npm

WORKDIR /usr/src/app

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml ./

# Set up Python Deps
COPY ytdlp-server/requirements.txt ./ytdlp-server/requirements.txt
WORKDIR /usr/src/app/ytdlp-server

ENV PYTHONUNBUFFERED=1 \
  VIRTUAL_ENV=/usr/src/app/ytdlp-server/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN pip install --no-cache-dir -r requirements.txt

# Install Node.js dependencies
WORKDIR /usr/src/app
RUN pnpm install --frozen-lockfile --prod

# Copy application code
COPY . .

EXPOSE 5000

CMD ["./node_modules/.bin/fastify", "start", "app.js"]
