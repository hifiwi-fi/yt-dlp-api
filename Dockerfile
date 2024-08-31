FROM alpine:3.20

RUN apk add --no-cache python3 py3-pip nodejs npm git supervisor

# Set up Python Deps
WORKDIR /usr/src/app

COPY --link . .

WORKDIR /usr/src/app/main-server

ENV PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/usr/src/app/main-server/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN pip install --no-cache-dir -r requirements.txt

RUN ./copy-getpot_bgutil.sh

WORKDIR /usr/src/app/bg-util-server

RUN npm i --omit=dev

WORKDIR /usr/src/app

EXPOSE 8080

CMD ["supervisord", "-c", "./supervisor.conf"]
