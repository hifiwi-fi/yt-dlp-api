FROM alpine:3.20

RUN apk add --no-cache python3 py3-pip nodejs npm git tmux go

WORKDIR /usr/src/app
COPY --link . .

ENV GOPATH="$HOME/go"
ENV PATH="$PATH:$GOPATH/bin"

RUN go install github.com/DarthSim/overmind/v2@latest

# Set up Python Deps
WORKDIR /usr/src/app/main-server

ENV PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/usr/src/app/main-server/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN pip install --no-cache-dir -r requirements.txt

WORKDIR /usr/src/app/bg-util-server

RUN npm i --omit=dev

WORKDIR /usr/src/app

EXPOSE 8080

CMD ["overmind", "start"]
