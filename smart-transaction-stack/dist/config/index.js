"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LAMPORTS_PER_SOL = exports.BLOCKHASH_EXPIRY_SLOTS = void 0;
exports.loadConfig = loadConfig;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const types_1 = require("../types");
Object.defineProperty(exports, "BLOCKHASH_EXPIRY_SLOTS", { enumerable: true, get: function () { return types_1.BLOCKHASH_EXPIRY_SLOTS; } });
dotenv_1.default.config();
function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function optionalEnv(name, fallback) {
    return process.env[name] || fallback;
}
function parseLamports(sol) {
    return Math.floor(parseFloat(sol) * 1_000_000_000);
}
function loadConfig() {
    return {
        solana: {
            rpcUrl: optionalEnv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),
            wsUrl: optionalEnv('SOLANA_WS_URL', 'wss://api.mainnet-beta.solana.com'),
        },
        yellowstone: {
            endpoint: requiredEnv('YELLOWSTONE_GRPC_ENDPOINT'),
            xToken: optionalEnv('YELLOWSTONE_X_TOKEN', ''),
            reconnectDelayMs: parseInt(optionalEnv('YELLOWSTONE_RECONNECT_DELAY_MS', '2000'), 10),
            maxReconnectAttempts: parseInt(optionalEnv('YELLOWSTONE_MAX_RECONNECT', '10'), 10),
            backpressureHighWater: parseInt(optionalEnv('YELLOWSTONE_BP_HIGH_WATER', '5000'), 10),
        },
        jito: {
            blockEngineUrl: optionalEnv('JITO_BLOCK_ENGINE_URL', 'https://mainnet.block-engine.jito.wtf'),
            tipAccountAddress: optionalEnv('JITO_TIP_ACCOUNT', '96gYZGDn1HcCqUoA1c8jMxJWkn2LxTYgW1fQbT1PqNqQ'),
            authKeypairPath: optionalEnv('JITO_AUTH_KEYPAIR', ''),
        },
        wallet: {
            privateKey: optionalEnv('WALLET_PRIVATE_KEY', ''),
        },
        ai: {
            apiKey: requiredEnv('OPENAI_API_KEY'),
            baseUrl: optionalEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
            model: optionalEnv('OPENAI_MODEL', 'gpt-4o'),
        },
        db: {
            path: path_1.default.resolve(optionalEnv('DATABASE_PATH', './data/stack.db')),
        },
        tip: {
            defaultLamports: parseLamports(optionalEnv('DEFAULT_TIP_SOL', '0.001')),
            minLamports: parseLamports(optionalEnv('MIN_TIP_SOL', '0.0001')),
            maxLamports: parseLamports(optionalEnv('MAX_TIP_SOL', '0.1')),
        },
        demo: {
            faultInjectionEnabled: process.env.FAULT_INJECTION_ENABLED === 'true',
        },
    };
}
exports.LAMPORTS_PER_SOL = 1_000_000_000;
//# sourceMappingURL=index.js.map