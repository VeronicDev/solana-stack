"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Store = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
let sqlJs = null;
async function getSqlJs() {
    if (!sqlJs) {
        const mod = await Promise.resolve().then(() => __importStar(require('sql.js')));
        const init = mod.default || mod;
        sqlJs = await init();
    }
    return sqlJs;
}
class Store {
    db = null;
    dbPath;
    saveTimer = null;
    dirty = false;
    constructor(dbPath) {
        this.dbPath = dbPath;
    }
    async initialize() {
        const dir = path_1.default.dirname(this.dbPath);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        const SQL = await getSqlJs();
        if (fs_1.default.existsSync(this.dbPath)) {
            const buffer = fs_1.default.readFileSync(this.dbPath);
            this.db = new SQL.Database(buffer);
        }
        else {
            this.db = new SQL.Database();
        }
        this.initializeSchema();
        this.startAutoSave();
    }
    initializeSchema() {
        this.db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        signature TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'submitted',
        submitted_at INTEGER NOT NULL,
        processed_at INTEGER,
        confirmed_at INTEGER,
        finalized_at INTEGER,
        submitted_slot INTEGER NOT NULL,
        processed_slot INTEGER,
        confirmed_slot INTEGER,
        finalized_slot INTEGER,
        bundle_id TEXT,
        tip_lamports INTEGER NOT NULL DEFAULT 0,
        error_category TEXT,
        error_code TEXT,
        error_message TEXT,
        error_slot INTEGER,
        retry_count INTEGER NOT NULL DEFAULT 0,
        label TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
        this.db.run(`
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        parameters TEXT NOT NULL DEFAULT '{}',
        confidence REAL NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id)
      )
    `);
        this.db.run(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slot INTEGER NOT NULL,
        total_submitted INTEGER NOT NULL DEFAULT 0,
        total_processed INTEGER NOT NULL DEFAULT 0,
        total_confirmed INTEGER NOT NULL DEFAULT 0,
        total_finalized INTEGER NOT NULL DEFAULT 0,
        total_failed INTEGER NOT NULL DEFAULT 0,
        avg_submit_to_process_ms REAL,
        avg_process_to_confirm_ms REAL,
        avg_confirm_to_finalize_ms REAL,
        recorded_at INTEGER NOT NULL
      )
    `);
        this.db.run('CREATE INDEX IF NOT EXISTS idx_tx_signature ON transactions(signature)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_tx_bundle ON transactions(bundle_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_decisions_tx ON decisions(transaction_id)');
        this.save();
    }
    startAutoSave() {
        this.saveTimer = setInterval(() => {
            if (this.dirty) {
                this.save();
                this.dirty = false;
            }
        }, 5000);
    }
    save() {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs_1.default.writeFileSync(this.dbPath, buffer);
    }
    markDirty() {
        this.dirty = true;
    }
    createTransaction(record) {
        const id = record.id ?? (0, uuid_1.v4)();
        const now = Date.now();
        this.db.run(`INSERT INTO transactions (id, signature, status, submitted_at, submitted_slot, tip_lamports, retry_count, label, created_at, updated_at)
       VALUES (?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?)`, [
            id,
            record.signature,
            now,
            record.submittedSlot,
            record.tipLamports ?? 0,
            record.retryCount ?? 0,
            record.label ?? null,
            now,
            now,
        ]);
        this.markDirty();
        return this.getTransaction(id);
    }
    updateTransactionStatus(id, status, slot, error) {
        const now = Date.now();
        const tx = this.getTransaction(id);
        if (!tx)
            return null;
        const updates = ['status = ?', 'updated_at = ?'];
        const params = [status, now];
        if (slot !== undefined && status !== 'failed') {
            const col = `${status}_slot`;
            updates.push(`${col} = ?`);
            params.push(slot);
        }
        const timeCol = `${status}_at`;
        if (status !== 'failed' &&
            !tx.timestamps[status]) {
            updates.push(`${timeCol} = ?`);
            params.push(now);
        }
        if (error) {
            updates.push('error_category = ?');
            updates.push('error_code = ?');
            updates.push('error_message = ?');
            updates.push('error_slot = ?');
            params.push(error.category, error.code, error.message, error.slot ?? null);
        }
        params.push(id);
        this.db.run(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`, params);
        this.markDirty();
        return this.getTransaction(id);
    }
    getTransaction(id) {
        const stmt = this.db.prepare('SELECT * FROM transactions WHERE id = ?');
        stmt.bind([id]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return this.rowToRecord(row);
        }
        stmt.free();
        return null;
    }
    getTransactionBySignature(sig) {
        const stmt = this.db.prepare('SELECT * FROM transactions WHERE signature = ? ORDER BY created_at DESC LIMIT 1');
        stmt.bind([sig]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return this.rowToRecord(row);
        }
        stmt.free();
        return null;
    }
    getTransactionsByStatus(status, limit = 100) {
        const stmt = this.db.prepare('SELECT * FROM transactions WHERE status = ? ORDER BY created_at DESC LIMIT ?');
        stmt.bind([status, limit]);
        const results = [];
        while (stmt.step()) {
            results.push(this.rowToRecord(stmt.getAsObject()));
        }
        stmt.free();
        return results;
    }
    getAllTransactions(limit = 1000) {
        const stmt = this.db.prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?');
        stmt.bind([limit]);
        const results = [];
        while (stmt.step()) {
            results.push(this.rowToRecord(stmt.getAsObject()));
        }
        stmt.free();
        return results;
    }
    updateBundleId(id, bundleId) {
        this.db.run('UPDATE transactions SET bundle_id = ?, updated_at = ? WHERE id = ?', [bundleId, Date.now(), id]);
        this.markDirty();
    }
    incrementRetry(id) {
        this.db.run('UPDATE transactions SET retry_count = retry_count + 1, updated_at = ? WHERE id = ?', [Date.now(), id]);
        this.markDirty();
    }
    recordDecision(transactionId, decision) {
        const id = (0, uuid_1.v4)();
        this.db.run('INSERT INTO decisions (id, transaction_id, action, reasoning, parameters, confidence, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)', [
            id,
            transactionId,
            decision.action,
            decision.reasoning,
            JSON.stringify(decision.parameters),
            decision.confidence,
            decision.timestamp,
        ]);
        this.markDirty();
    }
    getDecisions(transactionId) {
        const stmt = this.db.prepare('SELECT * FROM decisions WHERE transaction_id = ? ORDER BY timestamp ASC');
        stmt.bind([transactionId]);
        const results = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push({
                action: row.action,
                reasoning: row.reasoning,
                parameters: JSON.parse(row.parameters),
                confidence: row.confidence,
                timestamp: row.timestamp,
            });
        }
        stmt.free();
        return results;
    }
    recordMetrics(slot, metrics) {
        this.db.run(`INSERT INTO metrics (slot, total_submitted, total_processed, total_confirmed, total_finalized, total_failed,
       avg_submit_to_process_ms, avg_process_to_confirm_ms, avg_confirm_to_finalize_ms, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            slot,
            metrics.totalSubmitted,
            metrics.totalProcessed,
            metrics.totalConfirmed,
            metrics.totalFinalized,
            metrics.totalFailed,
            metrics.avgSubmitToProcessMs ?? null,
            metrics.avgProcessToConfirmMs ?? null,
            metrics.avgConfirmToFinalizeMs ?? null,
            Date.now(),
        ]);
        this.markDirty();
    }
    getLatencyStats() {
        const stmt = this.db.prepare(`
      SELECT
        AVG(processed_at - submitted_at) as avg_submit_process,
        AVG(confirmed_at - processed_at) as avg_process_confirm,
        AVG(finalized_at - confirmed_at) as avg_confirm_finalize,
        COUNT(*) as cnt
      FROM transactions
      WHERE finalized_at IS NOT NULL
    `);
        stmt.bind([]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return {
                avgSubmitToProcess: row.avg_submit_process ?? null,
                avgProcessToConfirm: row.avg_process_confirm ?? null,
                avgConfirmToFinalize: row.avg_confirm_finalize ?? null,
                count: row.cnt ?? 0,
            };
        }
        stmt.free();
        return { avgSubmitToProcess: null, avgProcessToConfirm: null, avgConfirmToFinalize: null, count: 0 };
    }
    exportLifecycleLogs() {
        const stmt = this.db.prepare(`SELECT
        id, signature, status, bundle_id, tip_lamports, retry_count, label,
        submitted_at, processed_at, confirmed_at, finalized_at,
        submitted_slot, processed_slot, confirmed_slot, finalized_slot,
        error_category, error_code, error_message
       FROM transactions ORDER BY created_at ASC`);
        stmt.bind([]);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }
    exportDecisionsLog() {
        const stmt = this.db.prepare(`SELECT d.*, t.signature, t.label
       FROM decisions d
       JOIN transactions t ON t.id = d.transaction_id
       ORDER BY d.timestamp ASC`);
        stmt.bind([]);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }
    close() {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
        }
        this.save();
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
    rowToRecord(row) {
        const timestamps = {
            submitted: row.submitted_at,
            processed: row.processed_at,
            confirmed: row.confirmed_at,
            finalized: row.finalized_at,
        };
        const slots = {
            submitted: row.submitted_slot,
            processed: row.processed_slot,
            confirmed: row.confirmed_slot,
            finalized: row.finalized_slot,
        };
        const deltas = {};
        if (timestamps.processed && timestamps.submitted) {
            deltas.submittedToProcessed = timestamps.processed - timestamps.submitted;
        }
        if (timestamps.confirmed && timestamps.processed) {
            deltas.processedToConfirmed = timestamps.confirmed - timestamps.processed;
        }
        if (timestamps.finalized && timestamps.confirmed) {
            deltas.confirmedToFinalized = timestamps.finalized - timestamps.confirmed;
        }
        if (timestamps.finalized && timestamps.submitted) {
            deltas.totalFromSubmitted = timestamps.finalized - timestamps.submitted;
        }
        let error;
        if (row.error_category) {
            error = {
                category: row.error_category,
                code: row.error_code,
                message: row.error_message,
                timestamp: timestamps.submitted,
                slot: row.error_slot,
            };
        }
        return {
            id: row.id,
            signature: row.signature,
            status: row.status,
            timestamps,
            slots,
            deltas,
            bundleId: row.bundle_id,
            tipLamports: row.tip_lamports,
            error,
            retryCount: row.retry_count,
            label: row.label,
        };
    }
}
exports.Store = Store;
//# sourceMappingURL=store.js.map