import { Store } from '../db/store';
import { ServiceEvent, TransactionRecord, AIDecision, FailureClassification } from '../types';
export declare class Observability {
    private logger;
    private store;
    private eventCounts;
    private logDir;
    constructor(store: Store, logDir?: string);
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
    trackEvent(event: ServiceEvent, data?: Record<string, unknown>): void;
    logTransactionSubmission(record: TransactionRecord): void;
    logStatusChange(record: TransactionRecord, oldStatus: string, newStatus: string): void;
    logFailure(record: TransactionRecord, failure: FailureClassification): void;
    logAIDecision(record: TransactionRecord, decision: AIDecision): void;
    getEventCounts(): Record<string, number>;
    generateReport(): Record<string, unknown>;
    exportLifecycleCsv(): string;
}
//# sourceMappingURL=observability.d.ts.map