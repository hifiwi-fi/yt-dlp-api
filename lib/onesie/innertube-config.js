import Innertube, { UniversalCache } from 'youtubei.js'
import { addMillisecondsToDate } from './addMillisecondsToDate.js'

/**
 * @import { FastifyBaseLogger } from 'fastify'
 * @import { Innertube as InnertubeType } from 'youtubei.js'
 */

/**
 * @typedef {object} InnertubeConfigOpts
 * @prop {number} [refreshMs] - The time in milliseconds to wait before refreshing the Innertube instance
 * @prop {FastifyBaseLogger?} [logger] - A pino logger instance
 */

export class InnertubeConfig {
  /** @type {number} */
  refreshMs = 1000 * 60 * 60 * 48  // 48 hours
  /** @type {FastifyBaseLogger?} */
  logger = null
  /** @type {Promise<InnertubeType>?} */
  inFlightRefresh = null

  /** @param {InnertubeConfigOpts} [opts] - Options for the InnertubeConfig instance */
  constructor ({
    refreshMs,
    logger
  } = {}) {
    this.innertube = null
    this.lastUpdated = null
    this.refreshMs = refreshMs || this.refreshMs
    if (logger != null) {
      this.logger = logger
    }

    // Start preloading the Innertube instance in the background
    this.#refreshInnertube()
  }

  /**
   * Returns the latest cached Innertube instance, or creates a new one, and de-duplicates in flight requests.
   * @return {Promise<InnertubeType>}
   */
  async getInnertube () {
    const now = new Date()

    if (!this.lastUpdated || !this.innertube) {
      return this.#refreshInnertube()
    }

    const nextUpdate = addMillisecondsToDate(this.lastUpdated, this.refreshMs)

    if (now < nextUpdate) {
      return this.innertube
    } else {
      this.logger?.info({
        lastUpdated: this.lastUpdated,
        nextUpdate,
      }, 'ReInitializing Innertube instance')
      return this.#refreshInnertube()
    }
  }

  async #refreshInnertube () {
    // If a refresh is already in flight, await the existing one
    if (this.inFlightRefresh) {
      this.logger?.info('Awaiting in-flight Innertube refresh')
      return await this.inFlightRefresh
    }

    // Log initialization on first refresh
    if (!this.lastUpdated) {
      this.logger?.info('Initializing Innertube instance')
    }

    // Create the refresh promise and set it on the class variable
    try {
      this.inFlightRefresh = createInnertubeInstance()
      this.innertube = await this.inFlightRefresh
      this.lastUpdated = new Date()
      return this.innertube
    } finally {
      // Clear the in-flight refresh once done
      this.inFlightRefresh = null
    }
  }
}

/**
 * Creates a new Innertube instance with UniversalCache.
 * @return {Promise<import('youtubei.js').Innertube>}
 */
async function createInnertubeInstance () {
  return await Innertube.create({ cache: new UniversalCache(true) })
}
