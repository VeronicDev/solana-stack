import EventEmitter from 'events';
import { TransactionRecord, YellowstoneTransactionEvent, FailureClassification } from '../types';
import { Store } from '../db/store';
import { Observability } from './observability';
export declare class LifecycleTracker extends EventEmitter {
    private store;
    private log;
    private pendingMap;
    constructor(store: Store, log: Observability);
    registerPending(signature: string, id: string): void;
    registerPendingBatch(signatures: string[], id: string): void;
    handleTransactionEvent(event: YellowstoneTransactionEvent): void;
    logStatusChange(record: TransactionRecord, oldStatus: string, newStatus: string): void;
    handleSubmission(id: string, signature: string, bundleId: string, slot: number, tipLamports: number, label?: string): TransactionRecord;
    markFailed(id: string, failure: FailureClassification, slot?: number): TransactionRecord | null;
    getLatencyStats(): {
        avgSubmitToProcess: number | null;
        avgProcessToConfirm: number | null;
        avgConfirmToFinalize: number | null;
        count: number;
    };
    getAllTransactions(): TransactionRecord[];
}
//# sourceMappingURL=lifecycle-tracker.d.ts.map