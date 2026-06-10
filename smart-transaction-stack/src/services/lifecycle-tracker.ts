import EventEmitter from 'events';
import {
  ServiceEvent,
  TransactionRecord,
  TransactionStatus,
  YellowstoneTransactionEvent,
  LifecycleTimestamps,
  LifecycleSlots,
  LatencyDeltas,
  FailureClassification,
} from '../types';
import { Store } from '../db/store';
import { computeLatencyDeltas } from '../utils/metrics';
import { Observability } from './observability';

export class LifecycleTracker extends EventEmitter {
  private store: Store;
  private log: Observability;
  private pendingMap: Map<string, string> = new Map();

  constructor(store: Store, log: Observability) {
    super();
    this.store = store;
    this.log = log;
  }

  registerPending(signature: string, id: string): void {
    this.pendingMap.set(signature, id);
  }

  registerPendingBatch(signatures: string[], id: string): void {
    for (const sig of signatures) {
      this.pendingMap.set(sig, id);
    }
  }

  handleTransactionEvent(event: YellowstoneTransactionEvent): void {
    const txId = this.pendingMap.get(event.signature);
    if (!txId) return;

    const tx = this.store.getTransaction(txId);
    if (!tx) return;

    const oldStatus = tx.status;
    const newStatus = event.status;
    const statusOrder: TransactionStatus[] = [
      'submitted',
      'processed',
      'confirmed',
      'finalized',
    ];

    const oldIdx = statusOrder.indexOf(oldStatus);
    const newIdx = statusOrder.indexOf(newStatus);

    if (newIdx <= oldIdx) return;

    let failure: FailureClassification | undefined;
    if (event.err) {
      failure = {
        category: 'unknown',
        code: 'TX_FAILED',
        message: JSON.stringify(event.err),
        timestamp: Date.now(),
        slot: event.slot,
      };
    }

    const updatedTx = this.store.updateTransactionStatus(
      txId,
      newStatus,
      event.slot,
      failure,
    );

    if (updatedTx) {
      this.logStatusChange(updatedTx, oldStatus, newStatus);
      this.emit(ServiceEvent.LIFECYCLE_UPDATE, updatedTx);

      if (newStatus === 'finalized') {
        this.pendingMap.delete(event.signature);
      }
    }
  }

  logStatusChange(
    record: TransactionRecord,
    oldStatus: string,
    newStatus: string,
  ): void {
    this.log.logStatusChange(record, oldStatus, newStatus);
  }

  handleSubmission(
    id: string,
    signature: string,
    bundleId: string,
    slot: number,
    tipLamports: number,
    label?: string,
  ): TransactionRecord {
    const record = this.store.createTransaction({
      id,
      signature,
      submittedSlot: slot,
      bundleId,
      tipLamports,
      label: label || 'bundle',
    });

    this.registerPending(signature, id);

    this.log.logTransactionSubmission(record);
    this.emit(ServiceEvent.LIFECYCLE_UPDATE, record);

    return this.store.getTransaction(id)!;
  }

  markFailed(
    id: string,
    failure: FailureClassification,
    slot?: number,
  ): TransactionRecord | null {
    const updated = this.store.updateTransactionStatus(
      id,
      'failed',
      slot,
      failure,
    );
    if (updated) {
      this.log.logFailure(updated, failure);
      this.emit(ServiceEvent.FAILURE_DETECTED, { record: updated, failure });
      this.emit(ServiceEvent.LIFECYCLE_UPDATE, updated);
    }
    return updated;
  }

  getLatencyStats() {
    return this.store.getLatencyStats();
  }

  getAllTransactions(): TransactionRecord[] {
    return this.store.getAllTransactions();
  }
}
