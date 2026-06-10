import { Connection, Keypair } from '@solana/web3.js';
import { loadConfig } from './config';
import { Store } from './db/store';
import { YellowstoneStream, LeaderMonitor, TipEngine, BundleEngine, LifecycleTracker, FailureClassifier, AIAgent, RetryEngine, Observability } from './services';
export declare class SmartTransactionStack {
    connection: Connection;
    store: Store;
    observability: Observability;
    yellowstone: YellowstoneStream;
    leaderMonitor: LeaderMonitor;
    tipEngine: TipEngine;
    bundleEngine: BundleEngine;
    lifecycleTracker: LifecycleTracker;
    failureClassifier: FailureClassifier;
    aiAgent: AIAgent;
    retryEngine: RetryEngine;
    private wallet;
    private running;
    constructor();
    private resolveWallet;
    private wireEvents;
    start(): Promise<void>;
    stop(): Promise<void>;
    getWallet(): Keypair;
    getConnection(): Connection;
}
export { loadConfig, Store };
export * from './services';
export * from './types';
//# sourceMappingURL=index.d.ts.map