import EventEmitter from 'events';
import { Connection } from '@solana/web3.js';
import { NetworkConditions } from '../types';
import { Observability } from './observability';
interface TipConfig {
    defaultLamports: number;
    minLamports: number;
    maxLamports: number;
}
interface TipDistribution {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
    p100: number;
    sampleSize: number;
}
export declare class TipEngine extends EventEmitter {
    private connection;
    private config;
    private log;
    private historicalTips;
    private landingSuccess;
    private lastRecommendedTip;
    private tipDistribution;
    private blockEngineUrl;
    constructor(connection: Connection, config: TipConfig, blockEngineUrl: string, log: Observability);
    private startPolling;
    private fetchTipFloor;
    recordLanding(success: boolean): void;
    getLandingRate(): number;
    recommendTip(conditions?: NetworkConditions, urgency?: number): number;
    private calculateMultiplier;
    getCurrentTipDistribution(): TipDistribution | null;
    getAverageHistoricalTip(): number;
    getLastRecommendedTip(): number;
}
export {};
//# sourceMappingURL=tip-engine.d.ts.map