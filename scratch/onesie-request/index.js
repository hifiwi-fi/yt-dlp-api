import { Parser } from 'youtubei.js'
import { onesieRequest, processMetadata } from '../../lib/onesie/index.js'
import { YouTubeTVClientConfig } from '../../lib/onesie/tv-config.js'
import Innertube from 'youtubei.js'

const tvConfigInstance = new YouTubeTVClientConfig()

const innertube = await Innertube.create({
  retrieve_innertube_config: false
})

const videoUrl = 'https://www.youtube.com/watch?v=JAs6WyK-Kr0'

const rawMetadata = await onesieRequest(videoUrl, innertube, tvConfigInstance)

const metadata = Parser.parseResponse(rawMetadata)

console.dir(metadata, { depth: 999 })

const processedMeta = await processMetadata(rawMetadata, 'video', innertube)

console.log({ processedMeta })
