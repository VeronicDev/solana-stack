import EventEmitter from 'events';
import { Observability } from './observability';
interface YellowstoneConfig {
    endpoint: string;
    xToken?: string;
    reconnectDelayMs: number;
    maxReconnectAttempts: number;
    backpressureHighWater: number;
}
export declare class YellowstoneStream extends EventEmitter {
    private config;
    private log;
    private client;
    private stream;
    private reconnectAttempts;
    private running;
    private backpressureBuffer;
    constructor(config: YellowstoneConfig, log: Observability);
    start(): Promise<void>;
    private connect;
    private handleData;
    private handleSlot;
    private handleBlock;
    private handleTransaction;
    private parseCommitment;
    private scheduleReconnect;
    private cleanup;
    stop(): void;
    getBufferStats(): {
        size: number;
        dropped: number;
    };
}
export {};
//# sourceMappingURL=yellowstone-stream.d.ts.map