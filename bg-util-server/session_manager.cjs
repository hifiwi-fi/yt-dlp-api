"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const bgutils_js_1 = require("bgutils-js");
const jsdom_1 = require("jsdom");
const youtubei_js_1 = require("youtubei.js");
const https_proxy_agent_1 = require("https-proxy-agent");
const axios_1 = __importDefault(require("axios"));
const socks_proxy_agent_1 = require("socks-proxy-agent");
class Logger {
    shouldLog;
    constructor(shouldLog = true) {
        this.shouldLog = shouldLog;
    }
    debug(msg) {
        if (this.shouldLog)
            console.debug(msg);
    }
    log(msg) {
        if (this.shouldLog)
            console.log(msg);
    }
    warn(msg) {
        if (this.shouldLog)
            console.warn(msg);
    }
    error(msg) {
        if (this.shouldLog)
            console.error(msg);
    }
}
class SessionManager {
    youtubeSessionDataCaches = {};
    TOKEN_TTL_HOURS;
    logger;
    constructor(shouldLog = true, youtubeSessionDataCaches = {}) {
        this.logger = new Logger(shouldLog);
        this.setYoutubeSessionDataCaches(youtubeSessionDataCaches);
        this.TOKEN_TTL_HOURS = process.env.TOKEN_TTL
            ? parseInt(process.env.TOKEN_TTL)
            : 6;
    }
    invalidateCaches() {
        this.setYoutubeSessionDataCaches();
    }
    cleanupCaches() {
        for (const visitIdentifier in this.youtubeSessionDataCaches) {
            const sessionData = this.youtubeSessionDataCaches[visitIdentifier];
            if (sessionData &&
                sessionData.generatedAt <
                    new Date(new Date().getTime() -
                        this.TOKEN_TTL_HOURS * 60 * 60 * 1000))
                delete this.youtubeSessionDataCaches[visitIdentifier];
        }
    }
    getYoutubeSessionDataCaches(cleanup = false) {
        if (cleanup)
            this.cleanupCaches();
        return this.youtubeSessionDataCaches;
    }
    setYoutubeSessionDataCaches(youtubeSessionData = {}) {
        this.youtubeSessionDataCaches = youtubeSessionData || {};
    }
    async generateVisitorData() {
        const innertube = await youtubei_js_1.Innertube.create({ retrieve_player: false });
        const visitorData = innertube.session.context.client.visitorData;
        if (!visitorData) {
            this.logger.error("Unable to generate visitor data via Innertube");
            return null;
        }
        return visitorData;
    }
    getProxyDispatcher(proxy) {
        if (!proxy)
            return undefined;
        let protocol;
        try {
            const parsedUrl = new URL(proxy);
            protocol = parsedUrl.protocol.replace(":", "");
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        }
        catch (e) {
            // assume http if no protocol was passed
            protocol = "http";
            proxy = `http://${proxy}`;
        }
        switch (protocol) {
            case "http":
            case "https":
                this.logger.log(`Using HTTP/HTTPS proxy: ${proxy}`);
                return new https_proxy_agent_1.HttpsProxyAgent(proxy);
            case "socks":
            case "socks4":
            case "socks4a":
            case "socks5":
            case "socks5h":
                this.logger.log(`Using SOCKS proxy: ${proxy}`);
                return new socks_proxy_agent_1.SocksProxyAgent(proxy);
            default:
                this.logger.warn(`Unsupported proxy protocol: ${proxy}`);
                return undefined;
        }
    }
    // mostly copied from https://github.com/LuanRT/BgUtils/tree/main/examples/node
    async generatePoToken(visitIdentifier, proxy = "") {
        this.cleanupCaches();
        const sessionData = this.youtubeSessionDataCaches[visitIdentifier];
        if (sessionData) {
            this.logger.log(`POT for ${visitIdentifier} still fresh, returning cached token`);
            return sessionData;
        }
        this.logger.log(`POT for ${visitIdentifier} stale or not yet generated, generating...`);
        // hardcoded API key that has been used by youtube for years
        const requestKey = "O43z0dpjhgX20SCx4KAo";
        const dom = new jsdom_1.JSDOM();
        globalThis.window = dom.window;
        globalThis.document = dom.window.document;
        let dispatcher;
        if (proxy) {
            dispatcher = this.getProxyDispatcher(proxy);
        }
        else {
            dispatcher = this.getProxyDispatcher(process.env.HTTPS_PROXY ||
                process.env.HTTP_PROXY ||
                process.env.ALL_PROXY);
        }
        const bgConfig = {
            fetch: async (url, options) => {
                try {
                    const response = await axios_1.default.post(url, options.body, {
                        headers: options.headers,
                        httpsAgent: dispatcher,
                    });
                    return {
                        ok: true,
                        json: async () => {
                            return response.data;
                        },
                    };
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                }
                catch (e) {
                    return {
                        ok: false,
                        json: async () => {
                            return null;
                        },
                    };
                }
            },
            globalObj: globalThis,
            identity: visitIdentifier,
            requestKey,
        };
        let challenge;
        try {
            challenge = await bgutils_js_1.BG.Challenge.create(bgConfig);
        }
        catch (e) {
            throw new Error(`Error while attempting to retrieve BG challenge. err = ${e}`);
        }
        if (!challenge)
            throw new Error("Could not get Botguard challenge");
        if (challenge.script) {
            const script = challenge.script.find((sc) => sc !== null);
            if (script)
                new Function(script)();
        }
        else {
            this.logger.log("Unable to load Botguard.");
        }
        let poToken;
        try {
            poToken = await bgutils_js_1.BG.PoToken.generate({
                program: challenge.challenge,
                globalName: challenge.globalName,
                bgConfig,
            });
        }
        catch (e) {
            throw new Error(`Error while trying to generate PO token. e = ${e}`);
        }
        this.logger.log(`po_token: ${poToken}`);
        this.logger.log(`visit_identifier: ${visitIdentifier}`);
        if (!poToken) {
            throw new Error("po_token unexpected undefined");
        }
        this.youtubeSessionDataCaches[visitIdentifier] = {
            visitIdentifier: visitIdentifier,
            poToken: poToken,
            generatedAt: new Date(),
        };
        return this.youtubeSessionDataCaches[visitIdentifier];
    }
}
exports.SessionManager = SessionManager;
//# sourceMappingURL=session_manager.js.map
