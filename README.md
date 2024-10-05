# yt-dlp-api

Running yt-dlp, youtubei.js, and googlevideo in a dedicated fastify service.

**Requirements**:

- Node.js > 22 (Top level)
- Python 3 (ytdlp-server)
- Protobuf

This is a rapidly evolving solution, so its doesn't make much sense to document thoroughly.

This service starts two processes: A fastify server which listens on 5000 and a python server (loopback only) on 5001. The fastify server makes requests to the flask server.

This is orchestrated in a Dockerfile, and can also boot from an npm start.

[Python Notes]('./ytdlp-server/README.md')
