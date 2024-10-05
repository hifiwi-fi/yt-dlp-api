/* eslint-disable camelcase */
import * as ytpi from 'youtubei.js'
import sjson from 'secure-json-parse'
import GoogleVideo, { base64ToU8, Protos, PART, QUALITY } from 'googlevideo'
import { decryptResponse, encryptRequest } from './utils.js'

/** @import {TvConfig} from './tv-config.js' */

const { Endpoints, YT, Parser, YTNodes } = ytpi

const formatSelector = /** @type {{
  audio: ytpi.Types.FormatOptions;
  video: ytpi.Types.FormatOptions;
}} */ ({
    audio: {
      quality: 'best',
      type: 'audio',
      format: 'm4a'
    },
    video: {
      quality: 'best',
      type: 'video+audio',
      format: 'mp4'
    }
  })

/**
 * @typedef {Awaited<ReturnType<typeof onesieRequest>>} OnesieRequest
 */

/**
 * @param  {string} youtubeUrl A url of a youtube video
 * @param  {ytpi.Innertube} innertube  Instance of youtubei.js innertube
 * @param  {TvConfig} tvConfigInstance   Instance of TvConfig
 */
export async function onesieRequest (youtubeUrl, innertube, tvConfigInstance) {
  const tvConfig = await tvConfigInstance.getConfig()
  const clientKeyData = tvConfig?.clientKeyData
  if (!clientKeyData) throw new Error('Missing clientKeyData from tvConfig')
  const onesieUstreamerConfig = tvConfig?.onesieUstreamerConfig
  if (!onesieUstreamerConfig) throw new Error('Missing onesieUstreamerConfig from tvConfig')
  const encryptedClientKey = tvConfig?.encryptedClientKey
  if (!encryptedClientKey) throw new Error('Missing encryptedClientKey from tvConfig')
  const baseUrl = tvConfig?.baseUrl
  if (!baseUrl) throw new Error('Missing baseUrl from tvConfig')

  let videoId
  try {
    const resolved = await innertube.resolveURL(youtubeUrl)
    videoId = resolved.payload.videoId
  } catch (err) {
    throw new Error('Error while resolving videoId', { cause: err })
  }
  if (!videoId) throw new Error('No videoId resolved')

  const sts = innertube.session.player?.sts

  if (!sts) {
    throw new Error('STS not found')
  }

  const clonedContext = structuredClone(innertube.session.context) // Clone the context to avoid modifying the original one
  const playerRequest = {
    context: clonedContext,
    ...Endpoints.PlayerEndpoint.build({
      video_id: videoId,
      sts
    })
  }

  // Change or remove these if you want to use a different client. I chose TVHTML5 purely for testing.
  // clonedContext.client.clientName = 'TVHTML5'
  // clonedContext.client.clientVersion = '7.20240717.18.00'

  const headers = [
    {
      name: 'Content-Type',
      value: 'application/json'
    },
    {
      name: 'User-Agent',
      value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
    },
    {
      name: 'X-Goog-Visitor-Id',
      value: innertube.session.context.client.visitorData
    }
  ]
  const onesieRequest = Protos.OnesieRequest.encode({
    url: 'https://youtubei.googleapis.com/youtubei/v1/player?key=AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8',
    headers,
    body: JSON.stringify(playerRequest),
    field4: false,
    field6: false
  }).finish()

  const { encrypted, hmac, iv } = await encryptRequest(tvConfig?.clientKeyData, onesieRequest)

  const body = Protos.OnesieInnertubeRequest.encode({
    encryptedRequest: {
      encryptedClientKey,
      encryptedOnesieRequest: encrypted,
      enableCompression: false,
      hmac,
      iv,
      TQ: true,
      YP: true
    },
    mediaInfo: {
      timeSinceLastManualFormatSelectionMs: 0,
      lastManualDirection: 0,
      quality: QUALITY.HD720,
      maxWidth: 640,
      maxHeight: 360,
      // @ts-ignore
      iea: 720,
      startTimeMs: 0,
      visibility: 0
    },
    streamerContext: {
      field5: [],
      field6: [],
      poToken: undefined,
      playbackCookie: undefined,
      clientInfo: {
        clientName: 7,
        clientVersion: '7.20240915.19.00'
      }
    },
    onesieUstreamerConfig
  }).finish()

  const redirectorResponse = await fetch(`https://redirector.googlevideo.com/initplayback?source=youtube&itag=0&pvi=0&pai=0&owc=yes&id=${Math.round(Math.random() * 1E5)}`, {
    method: 'GET',
    redirect: 'manual'
  })

  const redirectorResponseUrl = redirectorResponse.headers.get('location')

  if (!redirectorResponseUrl) { throw new Error('Invalid redirector response') }
  let url = `${redirectorResponseUrl.split('/initplayback')[0]}${baseUrl}`
  const queryParams = []

  const videoIdBytes = base64ToU8(videoId)
  const encodedVideoId = []

  for (const byte of videoIdBytes) {
    encodedVideoId.push(byte.toString(16).padStart(2, '0'))
  }

  queryParams.push(`id=${encodedVideoId.join('')}`)
  queryParams.push('&opr=1')
  queryParams.push('&por=1')
  queryParams.push('rn=1')

  /**
   * Add the following search params to get media data parts along with the onesie response:
   * Video: searchParams.push('pvi=337,336,335,787,788,313,271,248,247,780,779,244,243,242,137,136,135,134,133,160,360,358,357,274,317,273,318,280,279,225,224,145,144,222,223,143,142,359');
   * Audio: searchParams.push('pai=141,140,149,251,250');
   */

  url += `&${queryParams.join('&')}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'content-type': 'text/plain'
    },
    referrer: 'https://www.youtube.com/',
    body
  })

  const arrayBuffer = await response.arrayBuffer()

  const googUmp = new GoogleVideo.UMP(new GoogleVideo.ChunkedDataBuffer([new Uint8Array(arrayBuffer)]))

  /** @type {Array<Protos.OnesieHeader & { data?: Uint8Array }>} */
  const onesie = []

  googUmp.parse((part) => {
    const data = part.data.chunks[0]
    switch (part.type) {
      case PART.SABR_ERROR:
        // @ts-ignore
        console.log('[SABR_ERROR]:', Protos.SabrError.decode(data))
        break
      case PART.ONESIE_HEADER:
        // @ts-ignore
        onesie.push(Protos.OnesieHeader.decode(data))
        break
      case PART.ONESIE_DATA:
        // @ts-ignore
        onesie[onesie.length - 1].data = data
        break
      default:
        break
    }
  })

  const onesiePlayerResponse = onesie.find((header) => header.type === Protos.OnesieHeaderType.PLAYER_RESPONSE)
  if (onesiePlayerResponse) {
    if (!onesiePlayerResponse.cryptoParams) { throw new Error('Crypto params not found') }

    const iv = onesiePlayerResponse.cryptoParams.iv
    const hmac = onesiePlayerResponse.cryptoParams.hmac
    const encrypted = onesiePlayerResponse.data

    const decryptedData = await decryptResponse(iv, hmac, encrypted, clientKeyData)
    const response = Protos.OnesieInnertubeResponse.decode(decryptedData)

    if (response.proxyStatus !== 1) { throw new Error('Proxy status not OK') }

    if (response.status !== 200) { throw new Error('Status not OK') }

    const metadataRaw = sjson.parse(new TextDecoder().decode(response.body))
    return metadataRaw
  }
}

/**
 * @param  {any} metadataRaw the raw metadata
 * @param  {'audio' | 'video'} format    The desired format of the video
 * @param  {ytpi.Innertube} innertube  [description]
 */
export async function processMetadata (metadataRaw, format, innertube) {
  const metadata = Parser.parseResponse(metadataRaw)

  if (!metadata) throw new Error('Error parsing metadata')

  const microformat = metadata.microformat

  if (!(microformat instanceof YTNodes.PlayerMicroformat)) {
    throw new Error('microformat is not type PlayerMicroformat')
  }

  const video_details = metadata.video_details
  if (!video_details) throw new Error('No video details found')

  const is_upcoming = video_details.is_upcoming

  /**
   * @type {ytpi.Misc.Format | undefined}
   */
  let formatData
  if (!is_upcoming) {
    const playerResponse = {
      success: true,
      status_code: 200,
      data: metadataRaw
    }

    const info = new YT.VideoInfo([playerResponse], innertube.session.actions, '')
    formatData = info.chooseFormat(formatSelector[format])
  }

  return {
    title: microformat?.title.toString(),
    duration: video_details.duration,
    filesize_approx: formatData?.content_length ?? null,
    channel: microformat.channel.name, // author_name
    description: microformat.description.toString(),
    channel_url: microformat.channel.url, // author_url
    uploader_url: microformat.channel.url, // author_url
    ext: formatSelector[format].format,
    _type: format, // TODO: what is this
    thumbnail: microformat.thumbnails[0]?.url,
    url: formatData?.decipher(innertube.session.player),
    live_status: is_upcoming ? 'is_upcoming' : null,
    release_timestamp: microformat.start_timestamp
  }
}

/**
 * @param  {string} youtubeUrl A url of a youtube video
 * @param  {'audio' | 'video'} format    The desired format of the video
 * @param  {ytpi.Innertube} innertube  [description]
 * @param  {TvConfig} tvConfig   [description]
 */
export async function onesieFormatRequest (youtubeUrl, format, innertube, tvConfig) {
  const metadataRaw = await onesieRequest(youtubeUrl, innertube, tvConfig)

  if (!metadataRaw) throw new Error('Raw metadata was not returned')

  // const metadata = Parser.parseResponse(metadataRaw)

  return processMetadata(metadataRaw, format, innertube)
}
