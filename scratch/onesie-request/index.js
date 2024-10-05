import Innertube, { UniversalCache, Parser } from 'youtubei.js'
import { onesieRequest, processMetadata } from '../../lib/onesie/index.js'
import { TvConfig } from '../../lib/onesie/tv-config.js'

const tvConfigInstance = new TvConfig()

const innertube = await Innertube.create({ cache: new UniversalCache(true) })

const videoUrl = 'https://www.youtube.com/watch?v=JAs6WyK-Kr0'

const rawMetadata = await onesieRequest(videoUrl, innertube, tvConfigInstance)

const metadata = Parser.parseResponse(rawMetadata)

console.dir(metadata, { depth: 999 })

const processedMeta = processMetadata(rawMetadata, 'video', innertube)

console.log({ processedMeta })
