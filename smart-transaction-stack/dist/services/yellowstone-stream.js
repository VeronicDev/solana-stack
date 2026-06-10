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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.YellowstoneStream = void 0;
const events_1 = __importDefault(require("events"));
const types_1 = require("../types");
const metrics_1 = require("../utils/metrics");
class YellowstoneStream extends events_1.default {
    config;
    log;
    client = null;
    stream = null;
    reconnectAttempts = 0;
    running = false;
    backpressureBuffer;
    constructor(config, log) {
        super();
        this.config = config;
        this.log = log;
        this.backpressureBuffer = new metrics_1.BackpressureBuffer(config.backpressureHighWater);
    }
    async start() {
        this.running = true;
        this.log.info('Starting Yellowstone gRPC stream', {
            endpoint: this.config.endpoint,
        });
        await this.connect();
    }
    async connect() {
        try {
            const YellowstoneModule = await Promise.resolve().then(() => __importStar(require('@triton-one/yellowstone-grpc')));
            const Client = YellowstoneModule.default;
            const CommitmentLevel = YellowstoneModule.CommitmentLevel;
            const clientOptions = {
                'grpc.max_receive_message_length': 64 * 1024 * 1024,
            };
            this.client = new Client(this.config.endpoint, this.config.xToken, clientOptions);
            await this.client.connect();
            this.stream = await this.client.subscribe();
            this.stream.on('data', (data) => {
                this.handleData(data);
            });
            this.stream.on('error', (err) => {
                this.log.error('Yellowstone stream error', { error: err.message });
                this.scheduleReconnect();
            });
            this.stream.on('close', () => {
                this.log.warn('Yellowstone stream closed');
                this.scheduleReconnect();
            });
            this.stream.on('end', () => {
                this.log.warn('Yellowstone stream ended');
                this.scheduleReconnect();
            });
            const subscribeRequest = {
                slots: {
                    filterByCommitment: {
                        commitment: CommitmentLevel.CONFIRMED,
                    },
                },
                blocks: {},
                transactions: {
                    vote: false,
                    failed: true,
                    accountInclude: [],
                    accountExclude: [],
                    accountRequired: [],
                },
                commitment: CommitmentLevel.CONFIRMED,
            };
            this.stream.write(subscribeRequest);
            this.reconnectAttempts = 0;
            this.log.info('Yellowstone subscription active');
        }
        catch (err) {
            this.log.error('Failed to connect to Yellowstone', {
                error: err.message,
            });
            this.scheduleReconnect();
        }
    }
    handleData(data) {
        const enqueued = this.backpressureBuffer.push(data);
        if (!enqueued) {
            this.log.warn('Backpressure buffer full, dropping event');
            return;
        }
        if (data.slot !== undefined) {
            this.handleSlot(data.slot);
        }
        if (data.block !== undefined) {
            this.handleBlock(data.block);
        }
        if (data.transaction !== undefined) {
            this.handleTransaction(data.transaction);
        }
    }
    handleSlot(slotData) {
        const event = {
            slot: slotData.slot ?? 0,
            parent: slotData.parent ?? 0,
            status: this.parseCommitment(slotData.commitment ?? 1),
            timestamp: Date.now(),
        };
        this.emit(types_1.ServiceEvent.SLOT_UPDATE, event);
    }
    handleBlock(blockData) {
        const event = {
            slot: blockData.slot ?? 0,
            blockhash: blockData.blockhash ?? '',
            blockTime: blockData.blockTime ?? undefined,
            parentSlot: blockData.parentSlot ?? 0,
            timestamp: Date.now(),
        };
        this.emit(types_1.ServiceEvent.BLOCK_PRODUCED, event);
    }
    handleTransaction(txData) {
        const signature = txData.signature ??
            (txData.transaction?.signatures?.[0]) ??
            '';
        const event = {
            signature,
            slot: txData.slot ?? 0,
            status: this.parseCommitment(txData.commitment ?? 1),
            err: txData.err ?? undefined,
            timestamp: Date.now(),
            meta: txData.meta
                ? {
                    fee: txData.meta.fee ?? 0,
                    computeUnitsConsumed: txData.meta.computeUnitsConsumed ?? undefined,
                    logMessages: txData.meta.logMessages ?? undefined,
                }
                : undefined,
        };
        this.emit(types_1.ServiceEvent.TRANSACTION_SEEN, event);
    }
    parseCommitment(commitment) {
        switch (commitment) {
            case 0:
                return 'processed';
            case 1:
                return 'confirmed';
            case 2:
                return 'finalized';
            default:
                return 'confirmed';
        }
    }
    scheduleReconnect() {
        if (!this.running)
            return;
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            this.log.error('Max reconnect attempts reached');
            this.running = false;
            return;
        }
        this.reconnectAttempts++;
        const delay = this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);
        this.log.warn('Scheduling Yellowstone reconnect', {
            attempt: this.reconnectAttempts,
            delayMs: delay,
        });
        setTimeout(() => {
            if (this.running) {
                this.cleanup();
                this.connect();
            }
        }, delay);
    }
    cleanup() {
        if (this.stream) {
            try {
                this.stream.destroy();
            }
            catch { /* ignore */ }
            this.stream = null;
        }
        if (this.client) {
            try {
                this.client.close();
            }
            catch { /* ignore */ }
            this.client = null;
        }
    }
    stop() {
        this.running = false;
        this.cleanup();
        this.log.info('Yellowstone stream stopped');
    }
    getBufferStats() {
        return {
            size: this.backpressureBuffer.size,
            dropped: this.backpressureBuffer.totalDropped,
        };
    }
}
exports.YellowstoneStream = YellowstoneStream;
//# sourceMappingURL=yellowstone-stream.js.map