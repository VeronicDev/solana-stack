"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LifecycleTracker = void 0;
const events_1 = __importDefault(require("events"));
const types_1 = require("../types");
class LifecycleTracker extends events_1.default {
    store;
    log;
    pendingMap = new Map();
    constructor(store, log) {
        super();
        this.store = store;
        this.log = log;
    }
    registerPending(signature, id) {
        this.pendingMap.set(signature, id);
    }
    registerPendingBatch(signatures, id) {
        for (const sig of signatures) {
            this.pendingMap.set(sig, id);
        }
    }
    handleTransactionEvent(event) {
        const txId = this.pendingMap.get(event.signature);
        if (!txId)
            return;
        const tx = this.store.getTransaction(txId);
        if (!tx)
            return;
        const oldStatus = tx.status;
        const newStatus = event.status;
        const statusOrder = [
            'submitted',
            'processed',
            'confirmed',
            'finalized',
        ];
        const oldIdx = statusOrder.indexOf(oldStatus);
        const newIdx = statusOrder.indexOf(newStatus);
        if (newIdx <= oldIdx)
            return;
        let failure;
        if (event.err) {
            failure = {
                category: 'unknown',
                code: 'TX_FAILED',
                message: JSON.stringify(event.err),
                timestamp: Date.now(),
                slot: event.slot,
            };
        }
        const updatedTx = this.store.updateTransactionStatus(txId, newStatus, event.slot, failure);
        if (updatedTx) {
            this.logStatusChange(updatedTx, oldStatus, newStatus);
            this.emit(types_1.ServiceEvent.LIFECYCLE_UPDATE, updatedTx);
            if (newStatus === 'finalized') {
                this.pendingMap.delete(event.signature);
            }
        }
    }
    logStatusChange(record, oldStatus, newStatus) {
        this.log.logStatusChange(record, oldStatus, newStatus);
    }
    handleSubmission(id, signature, bundleId, slot, tipLamports, label) {
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
        this.emit(types_1.ServiceEvent.LIFECYCLE_UPDATE, record);
        return this.store.getTransaction(id);
    }
    markFailed(id, failure, slot) {
        const updated = this.store.updateTransactionStatus(id, 'failed', slot, failure);
        if (updated) {
            this.log.logFailure(updated, failure);
            this.emit(types_1.ServiceEvent.FAILURE_DETECTED, { record: updated, failure });
            this.emit(types_1.ServiceEvent.LIFECYCLE_UPDATE, updated);
        }
        return updated;
    }
    getLatencyStats() {
        return this.store.getLatencyStats();
    }
    getAllTransactions() {
        return this.store.getAllTransactions();
    }
}
exports.LifecycleTracker = LifecycleTracker;
//# sourceMappingURL=lifecycle-tracker.js.map