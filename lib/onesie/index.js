/* eslint-disable camelcase */
// Please leave any sort of common sense at the door. We're making public network requests to youtube.
import GoogleVideo, { base64ToU8, PART, Protos, QUALITY } from 'googlevideo'
import sjson from 'secure-json-parse'
import * as ytpi from 'youtubei.js'
import { decryptResponse, encryptRequest } from './utils.js'
import {
  request,
  Agent,
  interceptors
} from 'undici'

/** @import {YouTubeTVClientConfig, ClientConfig} from './tv-config.js' */
/** @import {InnertubeConfig} from './innertube-config.js' */

const { YT, Constants } = ytpi

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
 * @typedef {Awaited<ReturnType<typeof onesieRequest>>} OnesieRequestResults
 */

/**
 * @param  {string} youtubeUrl A url of a youtube video
 * @param  {InnertubeConfig} innertubeConfig  Instance of InnertubeConfig
 * @param  {YouTubeTVClientConfig} tvConfigInstance   Instance of TvConfig
 * @param {string} [poToken] PoTokens required only if you're using a WEB based client and rely on the adaptive formats.
 */
export async function onesieRequest (youtubeUrl, innertubeConfig, tvConfigInstance, poToken) {
  const clientConfig = await tvConfigInstance.getConfig()
  const innertube = await innertubeConfig.getInnertube()

  // Double check we got everything
  if (!clientConfig.clientKeyData) throw new Error('Missing clientKeyData from tvConfig')
  if (!clientConfig.onesieUstreamerConfig) throw new Error('Missing onesieUstreamerConfig from tvConfig')
  if (!clientConfig.encryptedClientKey) throw new Error('Missing encryptedClientKey from tvConfig')
  if (!clientConfig.baseUrl) throw new Error('Missing baseUrl from tvConfig')

  let videoId
  try {
    const resolved = await innertube.resolveURL(youtubeUrl)
    videoId = resolved.payload.videoId
  } catch (err) {
    throw new Error('Error while resolving videoId', { cause: err })
  }
  if (!videoId) throw new Error('No videoId resolved')

  const rawMetadata = await getRawMetadata({ innertube, poToken, clientConfig, videoId })

  return rawMetadata
}

/**
 * @typedef {{
 *   body: Uint8Array,
 *   encodedVideoId: string
 * }} OnesieRequest
 */

/**
 * Prepares a Onesie request. Adapted from googlevideo.
 * @param  {object} params
 * @param  {string} params.videoId
 * @param  {string} [params.poToken]
 * @param  {ClientConfig} params.clientConfig
 * @param  {ytpi.Innertube} params.innertube
 * @return {Promise<OnesieRequest>}
 */
async function prepareOnesieRequest ({
  videoId,
  poToken,
  clientConfig,
  innertube
}) {
  const { clientKeyData, encryptedClientKey, onesieUstreamerConfig } = clientConfig
  const clonedInnerTubeContext = structuredClone(innertube.session.context) // Clone the context to avoid modifying the original on

  // Change or remove these if you want to use a different client. I chose TVHTML5 purely for testing.
  // clonedInnerTubeContext.client.clientName = Constants.CLIENTS.TV.NAME
  // clonedInnerTubeContext.client.clientVersion = Constants.CLIENTS.TV.VERSION

  const sts = innertube.session.player?.sts

  if (!sts) {
    throw new Error('STS not found')
  }

  /** @type {Record<string, any>} */
  const playerEndpointpParams = {
    playbackContext: {
      contentPlaybackContext: {
        vis: 0,
        splay: false,
        lactMilliseconds: '-1',
        signatureTimestamp: innertube.session.player?.sts
      }
    },
    videoId
  }

  if (poToken) {
    playerEndpointpParams['serviceIntegrityDimensions'] = { poToken }
  }

  const playerRequestJson = {
    context: clonedInnerTubeContext,
    ...playerEndpointpParams
  }

  const headers = [
    {
      name: 'Content-Type',
      value: 'application/json'
    },
    {
      name: 'User-Agent',
      value: innertube.session.context.client.userAgent
    },
    {
      name: 'X-Goog-Visitor-Id',
      value: innertube.session.context.client.visitorData
    }
  ]

  const onesieRequest = Protos.OnesiePlayerRequest.encode({
    url: 'https://youtubei.googleapis.com/youtubei/v1/player?key=AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8',
    headers,
    body: JSON.stringify(playerRequestJson),
    proxiedByTrustedBandaid: true,
    skipResponseEncryption: true
  }).finish()

  const { encrypted, hmac, iv } = await encryptRequest(clientKeyData, onesieRequest)

  /**
   * Parses the client name from the cloned innerTube context using constant client name IDs.
   */
  const clientName = parseInt(
    Constants.CLIENT_NAME_IDS[
      /** @type {keyof typeof Constants.CLIENT_NAME_IDS} */
      (clonedInnerTubeContext.client.clientName)
    ]
  )

  const body = Protos.OnesieRequest.encode({
    urls: [],
    playerRequest: {
      encryptedClientKey,
      encryptedOnesiePlayerRequest: encrypted,
      /*
       * If you want to use an unencrypted player request:
       * unencryptedOnesiePlayerRequest: onesieRequest,
       */
      enableCompression: true,
      hmac,
      iv,
      useJsonformatterToParsePlayerResponse: false,
      serializeResponseAsJson: true // If false, the response will be serialized as protobuf.
    },
    clientAbrState: {
      timeSinceLastManualFormatSelectionMs: 0,
      lastManualDirection: 0,
      lastManualSelectedResolution: QUALITY.HD720,
      stickyResolution: QUALITY.HD720,
      playerTimeMs: 0,
      visibility: 0
    },
    streamerContext: {
      field5: [],
      field6: [],
      poToken: poToken ? base64ToU8(poToken) : undefined,
      playbackCookie: undefined,
      clientInfo: {
        clientName,
        clientVersion: clonedInnerTubeContext.client.clientVersion
      }
    },
    bufferedRanges: [],
    onesieUstreamerConfig
  }).finish()

  const videoIdBytes = base64ToU8(videoId)
  const encodedVideoIdChars = []

  for (const byte of videoIdBytes) {
    encodedVideoIdChars.push(byte.toString(16).padStart(2, '0'))
  }

  const encodedVideoId = encodedVideoIdChars.join('')

  return { body, encodedVideoId }
}

/**
 * Fetches basic video info (streaming data, video details, etc.) using a Onesie request (/initplayback). Adapted from googlevideo.
 * @param  {object} params
 * @param  {string} params.videoId
 * @param  {string} [params.poToken]
 * @param  {ClientConfig} params.clientConfig
 * @param  {ytpi.Innertube} params.innertube
 */
async function getRawMetadata ({ innertube, videoId, poToken, clientConfig }) {
  const redirectorResponse = await fetch(`https://redirector.googlevideo.com/initplayback?source=youtube&itag=0&pvi=0&pai=0&owc=yes&cmo:sensitive_content=yes&alr=yes&id=${Math.round(Math.random() * 1E5)}`, { method: 'GET' })
  const redirectorResponseUrl = await redirectorResponse.text()

  if (!redirectorResponseUrl.startsWith('https://')) { throw new Error('Invalid redirector response') }

  const preparedOnesieRequest = await prepareOnesieRequest({ videoId, poToken, clientConfig, innertube })

  let url = `${redirectorResponseUrl.split('/initplayback')[0]}${clientConfig.baseUrl}`

  const queryParams = []
  queryParams.push(`id=${preparedOnesieRequest.encodedVideoId}`)
  queryParams.push('opr=1')
  queryParams.push('por=1')
  queryParams.push('rn=1')
  queryParams.push('cmo:sensitive_content=yes')

  url += `&${queryParams.join('&')}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'content-type': 'application/octet-stream'
    },
    referrer: 'https://www.youtube.com/',
    body: preparedOnesieRequest.body
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

  const onesiePlayerResponse = onesie.find((header) => header.type === Protos.OnesieHeaderType.ONESIE_PLAYER_RESPONSE)

  if (!onesiePlayerResponse) {
    throw new Error('Player response not found')
  }

  if (!onesiePlayerResponse.cryptoParams) {
    throw new Error('Crypto params not found')
  }

  const iv = onesiePlayerResponse.cryptoParams.iv
  const hmac = onesiePlayerResponse.cryptoParams.hmac
  // const encrypted = onesiePlayerResponse.data

  let responseData = onesiePlayerResponse.data

  // Decompress the response data if compression is enabled.
  if (responseData && onesiePlayerResponse.cryptoParams.compressionType === Protos.CompressionType.GZIP) {
    if (typeof window === 'undefined') {
      const zlib = await import('node:zlib')
      responseData = new Uint8Array(zlib.gunzipSync(responseData))
    } else {
      const ds = new DecompressionStream('gzip')
      const stream = new Blob([responseData]).stream().pipeThrough(ds)
      responseData = await new Response(stream).arrayBuffer().then((buf) => new Uint8Array(buf))
    }
  }

  // const decryptedData = await decryptResponse(iv, hmac, encrypted, clientConfig.clientKeyData)
  // If skipResponseEncryption is set to true in the request, the response will not be encrypted.
  const decryptedData = hmac?.length && iv?.length ? await decryptResponse(iv, hmac, responseData, clientConfig.clientKeyData) : responseData
  if (!decryptedData) {
    throw new Error('Empty decrypted data')
  }
  const onesieInnertubeResponse = Protos.OnesiePlayerResponse.decode(decryptedData)

  if (onesieInnertubeResponse.onesieProxyStatus !== Protos.OnesieProxyStatus.OK) { throw new Error('Onesie proxy status not OK') }
  if (onesieInnertubeResponse.httpStatus !== 200) { throw new Error('Http status not OK') }

  const metadataRaw = sjson.parse(new TextDecoder().decode(onesieInnertubeResponse.body))
  return metadataRaw
}

/**
 * @param  {object} params
 * @param  {any} params.metadataRaw
 * @param  {ytpi.Innertube} params.innertube
 */
function rawMetaDataToBasicInfo ({ metadataRaw, innertube }) {
  const playerResponse = {
    success: true,
    status_code: 200,
    data: metadataRaw
  }

  const info = new YT.VideoInfo([playerResponse], innertube.actions, '')
  return info
}

/**
 * @param  {any} metadataRaw the raw metadata
 * @param  {'audio' | 'video'} format    The desired format of the video
 * @param  {ytpi.Innertube} innertube  [description]
 */
export async function processMetadata (metadataRaw, format, innertube) {
  const info = rawMetaDataToBasicInfo({ metadataRaw, innertube })

  const is_upcoming = info.basic_info.is_upcoming

  /**
   * @type {ytpi.Misc.Format | undefined}
   */
  let formatData
  if (!is_upcoming) {
    formatData = info.chooseFormat(formatSelector[format])
  }

  return {
    title: info.basic_info.title,
    duration: info.basic_info.duration,
    filesize_approx: formatData?.content_length ?? null,
    channel: info.basic_info?.channel?.name, // author_name
    description: info.basic_info.short_description,
    channel_url: info.basic_info?.channel?.url, // author_url
    uploader_url: info.basic_info?.channel?.url, // author_url
    ext: formatSelector[format].format,
    _type: format, // TODO: what is this
    thumbnail: info.basic_info.thumbnail?.[0]?.url,
    url: formatData?.decipher(innertube.session.player),
    live_status: is_upcoming ? 'is_upcoming' : null,
    release_timestamp: info.basic_info.start_timestamp
  }
}

/**
 * @param  {string} youtubeUrl A url of a youtube video
 * @param  {'audio' | 'video'} format    The desired format of the video
 * @param  {InnertubeConfig} innertubeConfig  [description]
 * @param  {YouTubeTVClientConfig} tvConfig   [description]
 * @param  {boolean} livenUrl   [description]
 */
export async function onesieFormatRequest (youtubeUrl, format, innertubeConfig, tvConfig, livenUrl = true) {
  const metadataRaw = await onesieRequest(youtubeUrl, innertubeConfig, tvConfig)

  if (!metadataRaw) throw new Error('Raw metadata was not returned')

  const innertube = await innertubeConfig.getInnertube()
  const metadata = await processMetadata(metadataRaw, format, innertube)
  const url = metadata.url

  if (livenUrl && url) {
    await sleep(3000) // Wait 3 seconds before testing the URL
    const dispatcher = new Agent()
      .compose(interceptors.responseError())
      .compose(interceptors.retry({
        maxRetries: 5,
        minTimeout: 2000,
        maxTimeout: 10000,
        timeoutFactor: 2,
        retryAfter: true,
        retry (err, { state }, callback) {
          const attempt = state.counter ?? 0
          let status
          let shouldRetry = false

          if (isUndiciResponseError(err)) {
            status = err.statusCode
            shouldRetry = status === 403
          } else {
            shouldRetry = Boolean(err)
          }

          if (shouldRetry) {
            console.log(`Retrying HEAD request (attempt ${attempt + 1}) — status: ${status}, error: ${err.message}`)
            setTimeout(() => callback(null), 1000)
          } else {
            callback(err)
          }
        }
      }))

    const res = await request(url, {
      method: 'HEAD',
      dispatcher
    })

    if (res.statusCode >= 400) {
      throw new Error(`HEAD check failed — got status ${res.statusCode}`)
    }
  } else {
    await sleep(5000) // Wait 5 seconds before returning the metadata
  }
  return metadata
}

/**
 * @param {unknown} err
 * @returns {err is Error & { code: 'UND_ERR_RESPONSE', statusCode: number }}
 */
function isUndiciResponseError (err) {
  return (
    err instanceof Error &&
    // @ts-expect-error
    err.code === 'UND_ERR_RESPONSE' &&
    // @ts-expect-error
    typeof err.statusCode === 'number'
  )
}

/** @param {number} ms */
async function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
