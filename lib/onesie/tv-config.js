import { request } from 'undici'
import sjson from 'secure-json-parse'
import { base64ToU8 } from 'googlevideo'

/**
 * @import { FastifyBaseLogger } from 'fastify'
 */

/**
 * @typedef {object} TvConfigOpts
 * @prop {number} [refreshMs] - The time in milliseconds to wait before refreshing the config
 * @prop {FastifyBaseLogger?} [logger] - A pino logger instance
 */
export class TvConfig {
  /** @type {number} */
  refreshMs = 1000 * 60 * 60 * 5  // 5 hours
  /** @type {FastifyBaseLogger?} */
  logger = null
  /** @type {Promise<any>?} */
  inFlightRefresh = null

  /** @param {TvConfigOpts} [opts] - Options for the TvConfig instance */
  constructor ({
    refreshMs,
    logger
  } = {}) {
    this.tvConfig = null
    this.lastUpdated = null
    this.refreshMs = refreshMs || this.refreshMs
    if (logger != null) {
      this.logger = logger
    }
  }

  async getConfig () {
    const now = new Date()

    if (!this.lastUpdated || !this.tvConfig) {
      this.logger?.info({
        lastUpdated: this.lastUpdated,
      }, 'Initializing TvConfig')
      return this.#refreshConfig()
    }

    const nextUpdate = addMillisecondsToDate(this.lastUpdated, this.refreshMs)

    if (now < nextUpdate) {
      return this.tvConfig
    } else {
      this.logger?.info({
        lastUpdated: this.lastUpdated,
        nextUpdate,
      }, 'ReInitializing TvConfig')
      return this.#refreshConfig()
    }
  }

  async #refreshConfig () {
    // If a refresh is already in flight, await the existing one
    if (this.inFlightRefresh) {
      this.logger?.info('Awaiting in-flight refresh')
      return await this.inFlightRefresh
    }

    // Create the refresh promise and set it on the class variable
    try {
      this.inFlightRefresh = getTvConfig()
      this.tvConfig = await this.inFlightRefresh
      this.lastUpdated = new Date()
      return this.tvConfig
    } finally {
      // Clear the in-flight refresh once done
      this.inFlightRefresh = null
    }
  }
}

/**
 * Add milliseconds to a Date object.
 * @param {Date} date
 * @param {number} milliseconds
 * @returns
 */
function addMillisecondsToDate (date, milliseconds) {
  return new Date(date.getTime() + milliseconds)
}

/**
 * @typedef {Awaited<ReturnType<typeof getTvConfig>>} TvConfigData
 */
export async function getTvConfig () {
  const tvConfigResponse = await request('https://www.youtube.com/tv_config?action_get_config=true&client=lb4&theme=cl', {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version'
    }
  })

  const tvConfigResponseData = await tvConfigResponse.body.text()

  if (!tvConfigResponseData.startsWith(')]}')) { throw new Error('Invalid JSPB response') }

  const configData = sjson.parse(tvConfigResponseData.slice(4))
  const webPlayerContextConfig = configData.webPlayerContextConfig.WEB_PLAYER_CONTEXT_CONFIG_ID_LIVING_ROOM_WATCH
  const onesieHotConfig = webPlayerContextConfig.onesieHotConfig

  const clientKeyData = base64ToU8(onesieHotConfig.clientKey)
  const encryptedClientKey = base64ToU8(onesieHotConfig.encryptedClientKey)
  const onesieUstreamerConfig = base64ToU8(onesieHotConfig.onesieUstreamerConfig)
  const baseUrl = onesieHotConfig.baseUrl

  return {
    clientKeyData,
    encryptedClientKey,
    onesieUstreamerConfig,
    baseUrl
  }
}