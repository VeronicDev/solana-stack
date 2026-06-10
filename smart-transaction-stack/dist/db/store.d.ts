import { TransactionRecord, TransactionStatus, FailureClassification, AIDecision } from '../types';
export declare class Store {
    private db;
    private dbPath;
    private saveTimer;
    private dirty;
    constructor(dbPath: string);
    initialize(): Promise<void>;
    private initializeSchema;
    private startAutoSave;
    private save;
    private markDirty;
    createTransaction(record: Partial<TransactionRecord> & {
        signature: string;
        submittedSlot: number;
    }): TransactionRecord;
    updateTransactionStatus(id: string, status: TransactionStatus, slot?: number, error?: FailureClassification): TransactionRecord | null;
    getTransaction(id: string): TransactionRecord | null;
    getTransactionBySignature(sig: string): TransactionRecord | null;
    getTransactionsByStatus(status: TransactionStatus, limit?: number): TransactionRecord[];
    getAllTransactions(limit?: number): TransactionRecord[];
    updateBundleId(id: string, bundleId: string): void;
    incrementRetry(id: string): void;
    recordDecision(transactionId: string, decision: AIDecision): void;
    getDecisions(transactionId: string): AIDecision[];
    recordMetrics(slot: number, metrics: {
        totalSubmitted: number;
        totalProcessed: number;
        totalConfirmed: number;
        totalFinalized: number;
        totalFailed: number;
        avgSubmitToProcessMs?: number;
        avgProcessToConfirmMs?: number;
        avgConfirmToFinalizeMs?: number;
    }): void;
    getLatencyStats(): {
        avgSubmitToProcess: number | null;
        avgProcessToConfirm: number | null;
        avgConfirmToFinalize: number | null;
        count: number;
    };
    exportLifecycleLogs(): Record<string, unknown>[];
    exportDecisionsLog(): Record<string, unknown>[];
    close(): void;
    private rowToRecord;
}
//# sourceMappingURL=store.d.ts.map