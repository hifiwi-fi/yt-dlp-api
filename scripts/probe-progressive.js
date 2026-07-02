/**
 * Experiment probe: how often do fresh visitor sessions receive progressive
 * (video+audio) formats from onesie player requests, what distinguishes a
 * "bad bucket" response (SABR markers?), does the capability appear with
 * delayed retries on the same session, and does player id matter?
 *
 * Usage:
 *   node scripts/probe-progressive.js hunt            # fresh sessions until a bad bucket, dump discriminators, then delayed retries
 *   node scripts/probe-progressive.js sweep [n]       # n probes (default 3) per player id + unpinned baseline
 *   node scripts/probe-progressive.js probe           # single fresh-session probe, dump summary
 */
import Innertube from 'youtubei.js'
import { request } from 'undici'
import { onesieRequest, processMetadata } from '../lib/onesie/index.js'
import { YouTubeTVClientConfig } from '../lib/onesie/tv-config.js'

const videoUrl = 'https://www.youtube.com/watch?v=6Dh-RL__uN4'

const PLAYER_IDS = ['56af1322', '8a6e7bc4', '6c5cb4f4', '487b9fc1', '56211dc2', '99f55c01', 'ecc3e9a7', '05540cb0', '9f4cc5e4']

const tvConfig = new YouTubeTVClientConfig()

/** @param {number} ms */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * @param {object} [innertubeOpts]
 */
async function freshSession (innertubeOpts = {}) {
  return await Innertube.create({ retrieve_innertube_config: true, ...innertubeOpts })
}

/**
 * @param {import('youtubei.js').Innertube} innertube
 */
async function probe (innertube) {
  const raw = await onesieRequest(videoUrl, innertube, tvConfig)
  const sd = raw?.streamingData ?? {}
  const formats = sd.formats ?? []
  const adaptive = sd.adaptiveFormats ?? []
  return {
    progressive: formats.length,
    progressiveItags: formats.map((/** @type {any} */ f) => f.itag),
    adaptive: adaptive.length,
    adaptiveWithUrl: adaptive.filter((/** @type {any} */ f) => f.url || f.signatureCipher).length,
    serverAbrStreamingUrl: Boolean(sd.serverAbrStreamingUrl),
    playability: raw?.playabilityStatus?.status,
    sdKeys: Object.keys(sd),
    ustreamerConfig: Boolean(raw?.playerConfig?.mediaCommonConfig?.mediaUstreamerRequestConfig?.videoPlaybackUstreamerConfig)
  }
}

/** @param {Awaited<ReturnType<typeof probe>>} r */
function summarize (r) {
  return `progressive=${r.progressive} [${r.progressiveItags}] adaptive=${r.adaptive} adaptiveWithUrl=${r.adaptiveWithUrl} sabrUrl=${r.serverAbrStreamingUrl} ustreamerCfg=${r.ustreamerConfig} playability=${r.playability}`
}

const mode = process.argv[2] ?? 'probe'

if (mode === 'interleave') {
  // Alternate baseline and pinned-player sessions per iteration so temporal
  // drift in the bucket rate can't confound the comparison. Checks real
  // playability (decipher + ranged fetch), not just format presence.
  const n = parseInt(process.argv[3] ?? '6', 10)
  const playerId = process.argv[4] ?? '6c5cb4f4'
  /** @type {Record<string, {offered: number, playable: number, runs: number}>} */
  const tally = {
    baseline: { offered: 0, playable: 0, runs: 0 },
    [playerId]: { offered: 0, playable: 0, runs: 0 }
  }
  for (let i = 0; i < n; i++) {
    for (const arm of /** @type {const} */ (['baseline', playerId])) {
      const t = tally[arm]
      t.runs++
      try {
        const innertube = await freshSession(arm === 'baseline' ? {} : { player_id: arm })
        const raw = await onesieRequest(videoUrl, innertube, tvConfig)
        const offered = (raw?.streamingData?.formats ?? []).length > 0
        let status = 'no-progressive'
        if (offered) {
          t.offered++
          const meta = await processMetadata(raw, 'video', innertube)
          const res = await request(/** @type {string} */ (meta.url), { headers: { Range: 'bytes=0-127' } })
          await res.body.arrayBuffer()
          status = `fetch=${res.statusCode}`
          if (res.statusCode === 200 || res.statusCode === 206) t.playable++
        }
        console.log(`iter ${i + 1} ${arm}: ${status}`)
      } catch (err) {
        console.log(`iter ${i + 1} ${arm}: ERROR ${/** @type {Error} */ (err).message}`)
      }
      await sleep(2000)
    }
  }
  console.log('\n=== interleave summary (offered / playable / runs) ===')
  for (const [arm, t] of Object.entries(tally)) console.log(`${arm}: ${t.offered} offered, ${t.playable} playable, of ${t.runs}`)
}

if (mode === 'experiments') {
  const n = parseInt(process.argv[3] ?? '10', 10)
  /** @type {{good: boolean, ids: Set<string>, cold: string, hot: string}[]} */
  const rows = []
  for (let i = 0; i < n; i++) {
    try {
      const innertube = await freshSession()
      const cfg = /** @type {any} */ (innertube.session.context.client).configInfo ?? {}
      const raw = await onesieRequest(videoUrl, innertube, tvConfig)
      const good = (raw?.streamingData?.formats ?? []).length > 0
      const stp = raw?.responseContext?.serviceTrackingParams ?? []
      const e = stp.find((/** @type {any} */ s) => s.service === 'GFEEDBACK')?.params?.find((/** @type {any} */ p) => p.key === 'e')?.value ?? ''
      const ids = new Set(e.split(',').filter(Boolean))
      const cold = String(cfg.coldHashData ?? '')
      const hot = String(cfg.hotHashData ?? '')
      rows.push({ good, ids, cold, hot })
      console.log(`session ${i + 1}: ${good ? 'GOOD' : 'BAD '} experiments=${ids.size} coldHash=${cold.slice(0, 24)} hotHash=${hot.slice(0, 24)}`)
    } catch (err) {
      console.log(`session ${i + 1}: ERROR ${/** @type {Error} */ (err).message}`)
    }
    await sleep(2000)
  }

  const goodRows = rows.filter(r => r.good)
  const badRows = rows.filter(r => !r.good)
  console.log(`\n${goodRows.length} good / ${badRows.length} bad`)
  if (goodRows.length && badRows.length) {
    const onlyBad = [...badRows[0].ids].filter(id => badRows.every(r => r.ids.has(id)) && goodRows.every(r => !r.ids.has(id)))
    const onlyGood = [...goodRows[0].ids].filter(id => goodRows.every(r => r.ids.has(id)) && badRows.every(r => !r.ids.has(id)))
    console.log('experiment ids in ALL bad sessions and NO good sessions:', onlyBad)
    console.log('experiment ids in ALL good sessions and NO bad sessions:', onlyGood)
    const coldDiscriminates = new Set(goodRows.map(r => r.cold)).size === 1 && new Set(badRows.map(r => r.cold)).size === 1 && goodRows[0].cold !== badRows[0].cold
    console.log('coldHashData alone discriminates good/bad:', coldDiscriminates)
  }
}

if (mode === 'probe') {
  const innertube = await freshSession()
  console.log(summarize(await probe(innertube)))
}

if (mode === 'hunt') {
  const maxHunts = 20
  let bad = null
  let innertube = null
  for (let i = 1; i <= maxHunts; i++) {
    innertube = await freshSession()
    const r = await probe(innertube)
    console.log(`hunt ${i}: ${summarize(r)}`)
    if (r.progressive === 0) {
      bad = r
      break
    }
    await sleep(2000)
  }

  if (!bad || !innertube) {
    console.log(`no bad bucket found in ${maxHunts} fresh sessions`)
    process.exit(0)
  }

  console.log('\nBAD BUCKET FOUND — full discriminator dump:')
  console.log(JSON.stringify(bad, null, 2))

  console.log('\nDelayed retries on the SAME session:')
  for (const delaySec of [5, 15, 30, 60, 120]) {
    await sleep(delaySec * 1000)
    const r = await probe(innertube)
    console.log(`after +${delaySec}s: ${summarize(r)}`)
    if (r.progressive > 0) {
      console.log('capability appeared with delay — bucket is NOT permanent')
      process.exit(0)
    }
  }
  console.log('no recovery within ~7.5 min — bucket looks sticky for the session')
}

if (mode === 'sweep') {
  const n = parseInt(process.argv[3] ?? '3', 10)
  const ids = process.argv[4] ? process.argv[4].split(',') : PLAYER_IDS
  /** @type {Record<string, string>} */
  const results = {}
  for (const playerId of [null, ...ids]) {
    const label = playerId ?? 'baseline(unpinned)'
    let ok = 0
    let fail = 0
    let err = 0
    for (let i = 0; i < n; i++) {
      try {
        const innertube = await freshSession(playerId ? { player_id: playerId } : {})
        const r = await probe(innertube)
        r.progressive > 0 ? ok++ : fail++
        console.log(`${label} run ${i + 1}: ${summarize(r)}`)
      } catch (e) {
        err++
        console.log(`${label} run ${i + 1}: ERROR ${/** @type {Error} */ (e).message}`)
      }
      await sleep(2000)
    }
    results[label] = `${ok} ok / ${fail} no-progressive / ${err} error`
  }
  console.log('\n=== sweep summary ===')
  for (const [label, tally] of Object.entries(results)) console.log(`${label}: ${tally}`)
}
