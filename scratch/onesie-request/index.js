import { Parser } from 'youtubei.js'
import { onesieRequest, processMetadata } from '../../lib/onesie/index.js'
import { YouTubeTVClientConfig } from '../../lib/onesie/tv-config.js'
import { InnertubeConfig } from '../../lib/onesie/innertube-config.js'

const tvConfigInstance = new YouTubeTVClientConfig()
const innertubeConfig = new InnertubeConfig()

const videoUrl = 'https://www.youtube.com/watch?v=JAs6WyK-Kr0'

const rawMetadata = await onesieRequest(videoUrl, innertubeConfig, tvConfigInstance)

const metadata = Parser.parseResponse(rawMetadata)

console.dir(metadata, { depth: 999 })

const innertube = await innertubeConfig.getInnertube()
const processedMeta = await processMetadata(rawMetadata, 'video', innertube)

console.log({ processedMeta })
