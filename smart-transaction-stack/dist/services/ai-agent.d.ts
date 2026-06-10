import EventEmitter from 'events';
import { AIDecision, FailureClassification, NetworkConditions, TransactionRecord, PendingTransaction } from '../types';
import { Store } from '../db/store';
import { Observability } from './observability';
interface AIConfig {
    apiKey: string;
    baseUrl: string;
    model: string;
}
export declare class AIAgent extends EventEmitter {
    private config;
    private store;
    private log;
    private openai;
    constructor(config: AIConfig, store: Store, log: Observability);
    initialize(): Promise<void>;
    decide(pending: PendingTransaction, failure: FailureClassification, conditions: NetworkConditions, recentHistory: TransactionRecord[]): Promise<AIDecision>;
    private buildContext;
    private validateDecision;
    private fallbackDecision;
}
export {};
//# sourceMappingURL=ai-agent.d.ts.map