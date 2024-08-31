import { BG } from 'bgutils-js'
import { JSDOM } from 'jsdom'

/**
 * @import { BgConfig } from 'bgutils-js'
 */

/**
 * @typedef {Object} YoutubeSessionData
 * @property {string} poToken - The token used for the session.
 * @property {string} visitIdentifier - The identifier for the visit.
 * @property {Date} generatedAt - The date when the session data was generated.
 */

export class SessionManager {
  /**
     * @type {{ [visitIdentifier: string]: YoutubeSessionData }}
     * @private
     */
  youtubeSessionData = {}

  /**
     * Generates a poToken for the given visitIdentifier. If a valid token exists,
     * it will return the cached version; otherwise, it generates a new one.
     *
     * @param {string} visitIdentifier - The identifier for the visit.
     * @returns {Promise<YoutubeSessionData>} The session data including the generated poToken.
     */
  async generatePoToken (visitIdentifier) {
    const sessionData = this.youtubeSessionData[visitIdentifier]
    if (
      sessionData &&
            sessionData.generatedAt >
                new Date(new Date().getTime() - 6 * 60 * 60 * 1000)
    ) {
      console.info(
                `POT for ${visitIdentifier} still fresh, returning cached token`
      )
      return sessionData
    }

    console.info(
            `POT for ${visitIdentifier} stale or not yet generated, generating...`
    )

    // hardcoded API key that has been used by youtube for years
    const requestKey = 'O43z0dpjhgX20SCx4KAo'
    const dom = new JSDOM()

    // @ts-ignore
    globalThis.window = dom.window
    globalThis.document = dom.window.document

    /**
     * @type {BgConfig}
     */
    const bgConfig = {
      fetch: (url, options) => fetch(url, options),
      globalObj: globalThis,
      identifier: visitIdentifier,
      requestKey,
    }

    const challenge = await BG.Challenge.create(bgConfig)

    if (!challenge) throw new Error('Could not get Botguard challenge')

    if (challenge.script) {
      const script = challenge.script.find((sc) => sc !== null)
      // eslint-disable-next-line no-new-func
      if (script) new Function(script)()
    } else {
      console.warn('Unable to load Botguard.')
    }

    const poToken = await BG.PoToken.generate({
      program: challenge.challenge,
      globalName: challenge.globalName,
      bgConfig,
    })

    console.info('po_token:', poToken)
    console.info('visit_identifier:', visitIdentifier)

    if (!poToken) {
      throw new Error('po_token unexpected undefined')
    }

    this.youtubeSessionData[visitIdentifier] = {
      visitIdentifier,
      poToken,
      generatedAt: new Date(),
    }

    return this.youtubeSessionData[visitIdentifier]
  }
}
