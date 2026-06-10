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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Store = exports.loadConfig = exports.SmartTransactionStack = void 0;
const web3_js_1 = require("@solana/web3.js");
const config_1 = require("./config");
Object.defineProperty(exports, "loadConfig", { enumerable: true, get: function () { return config_1.loadConfig; } });
const store_1 = require("./db/store");
Object.defineProperty(exports, "Store", { enumerable: true, get: function () { return store_1.Store; } });
const services_1 = require("./services");
const types_1 = require("./types");
class SmartTransactionStack {
    connection;
    store;
    observability;
    yellowstone;
    leaderMonitor;
    tipEngine;
    bundleEngine;
    lifecycleTracker;
    failureClassifier;
    aiAgent;
    retryEngine;
    wallet;
    running = false;
    constructor() {
        const config = (0, config_1.loadConfig)();
        this.connection = new web3_js_1.Connection(config.solana.rpcUrl, {
            commitment: 'confirmed',
            wsEndpoint: config.solana.wsUrl,
        });
        this.store = new store_1.Store(config.db.path);
        this.observability = new services_1.Observability(this.store);
        this.yellowstone = new services_1.YellowstoneStream(config.yellowstone, this.observability);
        this.leaderMonitor = new services_1.LeaderMonitor(this.connection, this.observability);
        this.tipEngine = new services_1.TipEngine(this.connection, config.tip, config.jito.blockEngineUrl, this.observability);
        this.bundleEngine = new services_1.BundleEngine(this.connection, config.jito, this.observability);
        this.lifecycleTracker = new services_1.LifecycleTracker(this.store, this.observability);
        this.failureClassifier = new services_1.FailureClassifier();
        this.aiAgent = new services_1.AIAgent(config.ai, this.store, this.observability);
        this.wallet = this.resolveWallet(config.wallet.privateKey);
        this.retryEngine = new services_1.RetryEngine(this.store, this.bundleEngine, this.tipEngine, this.lifecycleTracker, this.failureClassifier, this.aiAgent, this.observability, this.wallet);
        this.wireEvents();
    }
    resolveWallet(privateKey) {
        if (privateKey) {
            const secretKey = Uint8Array.from(JSON.parse(privateKey));
            return web3_js_1.Keypair.fromSecretKey(secretKey);
        }
        this.observability.warn('No wallet private key configured, generating ephemeral keypair');
        return web3_js_1.Keypair.generate();
    }
    wireEvents() {
        this.yellowstone.on(types_1.ServiceEvent.SLOT_UPDATE, (event) => {
            this.leaderMonitor.handleSlotUpdate(event);
            this.observability.trackEvent(types_1.ServiceEvent.SLOT_UPDATE, {
                slot: event.slot,
                status: event.status,
            });
        });
        this.yellowstone.on(types_1.ServiceEvent.TRANSACTION_SEEN, (event) => {
            this.lifecycleTracker.handleTransactionEvent(event);
            this.observability.trackEvent(types_1.ServiceEvent.TRANSACTION_SEEN, {
                signature: event.signature.slice(0, 16),
                status: event.status,
            });
        });
        this.yellowstone.on(types_1.ServiceEvent.BLOCK_PRODUCED, (event) => {
            this.observability.trackEvent(types_1.ServiceEvent.BLOCK_PRODUCED, {
                slot: event.slot,
                blockhash: event.blockhash.slice(0, 8),
            });
        });
        this.leaderMonitor.on(types_1.ServiceEvent.LEADER_CHANGE, (event) => {
            this.observability.trackEvent(types_1.ServiceEvent.LEADER_CHANGE, {
                slot: event.slot,
                leader: event.leader?.slice(0, 16),
                isJito: event.isJito,
                slotsUntilJito: event.slotsUntilJito,
            });
        });
        this.tipEngine.on(types_1.ServiceEvent.METRICS_UPDATE, (event) => {
            this.observability.trackEvent(types_1.ServiceEvent.METRICS_UPDATE, event);
        });
    }
    async start() {
        this.running = true;
        this.observability.info('Smart Transaction Stack starting');
        await this.store.initialize();
        await this.bundleEngine.initialize(this.wallet);
        await this.aiAgent.initialize();
        await this.yellowstone.start();
        await this.leaderMonitor.start();
        this.observability.info('Smart Transaction Stack started');
    }
    async stop() {
        this.running = false;
        this.yellowstone.stop();
        this.leaderMonitor.stop();
        this.observability.info('Smart Transaction Stack stopped');
    }
    getWallet() {
        return this.wallet;
    }
    getConnection() {
        return this.connection;
    }
}
exports.SmartTransactionStack = SmartTransactionStack;
__exportStar(require("./services"), exports);
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map