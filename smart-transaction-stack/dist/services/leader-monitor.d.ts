import EventEmitter from 'events';
import { Connection } from '@solana/web3.js';
import { YellowstoneSlotEvent, NetworkConditions } from '../types';
import { Observability } from './observability';
export declare class LeaderMonitor extends EventEmitter {
    private connection;
    private log;
    private currentSlot;
    private currentEpoch;
    private cachedSchedule;
    private knownJitoValidators;
    private scheduleRefreshInterval;
    constructor(connection: Connection, log: Observability);
    start(): Promise<void>;
    private refreshEpoch;
    private fetchLeaderSchedule;
    handleSlotUpdate(event: YellowstoneSlotEvent): void;
    getNetworkConditions(): NetworkConditions;
    private getLeaderForSlot;
    private getNextJitoLeader;
    addJitoValidator(pubkey: string): void;
    setKnownJitoValidators(validators: string[]): void;
    private estimateCongestion;
    getCurrentSlot(): number;
    isJitoSlot(slot: number): boolean;
    stop(): void;
}
//# sourceMappingURL=leader-monitor.d.ts.map