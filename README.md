# yt-dlp-api

Running yt-dlp, youtubei.js, and googlevideo in a dedicated fastify service.

**Requirements**:

- Node.js > 22 (Top level)
- Python 3 (ytdlp-server)
- Protobuf

This is a rapidly evolving solution, so its doesn't make much sense to document thoroughly.

This service runs Fastify with one persistent Python child process.
Fastify sends framed extraction requests to Python over inherited process pipes, and Python keeps `yt-dlp` warm between requests.

This is orchestrated in a Dockerfile, and can also boot from an npm start.

## Internal imports

Use package `imports` aliases for cross-area imports that would otherwise require deep `../../` paths, and keep relative imports for nearby sibling files. Examples:

```js
import { build } from '#test/helper.js'
/** @import { OnesieFormatResults } from '#lib/onesie/index.js' */
/** @import { ExtractKnownResponseType } from '#types/fastify-utils.js' */
```

For TypeScript source files behind an alias, import the runtime `.js` specifier and let `package.json#imports` map it to the `.ts` source for type checking.

[Python Notes]('./ytdlp-server/README.md')
