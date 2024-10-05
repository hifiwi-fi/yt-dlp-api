// @ts-nocheck
import { JSDOM } from 'jsdom'
import { Innertube, UniversalCache } from 'youtubei.js'
import { fetch } from 'undici'

import { BG } from 'bgutils-js'

let innertube = await Innertube.create({ retrieve_player: false })

const requestKey = 'O43z0dpjhgX20SCx4KAo'
const visitorData = innertube.session.context.client.visitorData

const dom = new JSDOM()

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document
})

const bgConfig = {
  fetch: (url, options) => fetch(url, options),
  globalObj: globalThis,
  identifier: visitorData,
  requestKey,
}

const challenge = await BG.Challenge.create(bgConfig)

if (!challenge) { throw new Error('Could not get challenge') }

if (challenge.script) {
  const script = challenge.script.find((sc) => sc !== null)
  if (script) { new Function(script)() }
} else {
  console.warn('Unable to load Botguard.')
}

const poToken = await BG.PoToken.generate({
  program: challenge.challenge,
  globalName: challenge.globalName,
  bgConfig
})

const placeholderPoToken = BG.PoToken.generatePlaceholder(visitorData)

console.log('Session Info:', {
  visitorData,
  placeholderPoToken,
  poToken,
})

console.log('\n')

console.log({ poToken })

innertube = await Innertube.create({
  po_token: poToken,
  visitor_data: visitorData,
  cache: new UniversalCache(),
  generate_session_locally: true,
})

const basicInfo = await innertube.getBasicInfo('Itlu7HAjmUo')
console.dir({ basicInfo }, { depth: 999 })
const audioStreamingURL = basicInfo.chooseFormat({ quality: 'best', type: 'audio' }).decipher(innertube.session.player)

console.info('Streaming URL:', audioStreamingURL)


const endpoint = await innertube.resolveURL('https://www.youtube.com/watch?v=WLGaAE4_RjQ')
console.log({ endpoint })
const info = await innertube.getInfo(endpoint.payload.videoId)
console.log({ info }, { depth: 999 })
