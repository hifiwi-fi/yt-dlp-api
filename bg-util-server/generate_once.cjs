"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const session_manager_1 = require("./session_manager");
const extra_typings_1 = require("@commander-js/extra-typings");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const CACHE_PATH = path.resolve(__dirname, "..", "cache.json");
const program = new extra_typings_1.Command()
    .option("-v, --visitor-data <visitordata>")
    .option("-d, --data-sync-id <data-sync-id>")
    .option("-p, --proxy <proxy-all>")
    .option("--verbose");
program.parse();
const options = program.opts();
(async () => {
    const visitorData = options.visitorData;
    const dataSyncId = options.dataSyncId;
    const proxy = options.proxy || "";
    const verbose = options.verbose || false;
    let visitIdentifier;
    const cache = {};
    if (fs.existsSync(CACHE_PATH)) {
        try {
            const parsedCaches = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
            for (const visitIdentifier in parsedCaches) {
                const parsedCache = parsedCaches[visitIdentifier];
                if (parsedCache) {
                    cache[visitIdentifier] = {
                        poToken: parsedCache.poToken,
                        generatedAt: new Date(parsedCache.generatedAt),
                        visitIdentifier,
                    };
                }
            }
        }
        catch (e) {
            console.warn(`Error parsing cache. e = ${e}`);
        }
    }
    const sessionManager = new session_manager_1.SessionManager(verbose, cache);
    function log(msg) {
        if (verbose)
            console.log(msg);
    }
    if (dataSyncId) {
        log(`Received request for data sync ID: '${dataSyncId}'`);
        visitIdentifier = dataSyncId;
    }
    else if (visitorData) {
        log(`Received request for visitor data: '${visitorData}'`);
        visitIdentifier = visitorData;
    }
    else {
        log(`Received request for visitor data, grabbing from Innertube`);
        const generatedVisitorData = await sessionManager.generateVisitorData();
        if (!generatedVisitorData)
            process.exit(1);
        log(`Generated visitor data: ${generatedVisitorData}`);
        visitIdentifier = generatedVisitorData;
    }
    const sessionData = await sessionManager.generatePoToken(visitIdentifier, proxy);
    try {
        fs.writeFileSync(CACHE_PATH, JSON.stringify(sessionManager.getYoutubeSessionDataCaches(true)), "utf8");
    }
    catch (e) {
        console.warn(`Error writing cache. e = ${e}`);
    }
    finally {
        console.log(JSON.stringify(sessionData));
    }
})();
//# sourceMappingURL=generate_once.js.map