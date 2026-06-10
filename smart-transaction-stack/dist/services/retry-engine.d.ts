import EventEmitter from 'events';
import { VersionedTransaction, Keypair } from '@solana/web3.js';
import { AIDecision, NetworkConditions, PendingTransaction, TransactionRecord } from '../types';
import { Store } from '../db/store';
import { BundleEngine } from './bundle-engine';
import { TipEngine } from './tip-engine';
import { LifecycleTracker } from './lifecycle-tracker';
import { FailureClassifier } from './failure-classifier';
import { AIAgent } from './ai-agent';
import { Observability } from './observability';
export declare class RetryEngine extends EventEmitter {
    private store;
    private bundleEngine;
    private tipEngine;
    private lifecycleTracker;
    private failureClassifier;
    private aiAgent;
    private log;
    private wallet;
    private maxRetries;
    private activeRetries;
    constructor(store: Store, bundleEngine: BundleEngine, tipEngine: TipEngine, lifecycleTracker: LifecycleTracker, failureClassifier: FailureClassifier, aiAgent: AIAgent, log: Observability, wallet: Keypair);
    submitWithRetry(buildTx: (blockhash: string) => Promise<VersionedTransaction[]>, tipLamports: number, conditions: NetworkConditions, label?: string): Promise<{
        success: boolean;
        record?: TransactionRecord;
        finalDecision?: AIDecision;
    }>;
    private submitBundle;
    private executeDecision;
    private sleep;
    getActiveRetries(): Map<string, PendingTransaction>;
}
//# sourceMappingURL=retry-engine.d.ts.map