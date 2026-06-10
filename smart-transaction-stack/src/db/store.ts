import fs from 'fs';
import path from 'path';
import {
  TransactionRecord,
  TransactionStatus,
  FailureClassification,
  LifecycleTimestamps,
  LifecycleSlots,
  LatencyDeltas,
  AIDecision,
} from '../types';
import { v4 as uuid } from 'uuid';

let sqlJs: any = null;
async function getSqlJs(): Promise<any> {
  if (!sqlJs) {
    const mod = await import('sql.js');
    const init = mod.default || mod;
    sqlJs = await init();
  }
  return sqlJs;
}

export class Store {
  private db: any = null;
  private dbPath: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const SQL = await getSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    this.initializeSchema();
    this.startAutoSave();
  }

  private initializeSchema(): void {
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

    this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_tx_signature ON transactions(signature)',
    );
    this.db.run('CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status)');
    this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_tx_bundle ON transactions(bundle_id)',
    );
    this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_decisions_tx ON decisions(transaction_id)',
    );

    this.save();
  }

  private startAutoSave(): void {
    this.saveTimer = setInterval(() => {
      if (this.dirty) {
        this.save();
        this.dirty = false;
      }
    }, 5000);
  }

  private save(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  private markDirty(): void {
    this.dirty = true;
  }

  createTransaction(
    record: Partial<TransactionRecord> & {
      signature: string;
      submittedSlot: number;
    },
  ): TransactionRecord {
    const id = record.id ?? uuid();
    const now = Date.now();
    this.db.run(
      `INSERT INTO transactions (id, signature, status, submitted_at, submitted_slot, tip_lamports, retry_count, label, created_at, updated_at)
       VALUES (?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        record.signature,
        now,
        record.submittedSlot,
        record.tipLamports ?? 0,
        record.retryCount ?? 0,
        record.label ?? null,
        now,
        now,
      ],
    );
    this.markDirty();
    return this.getTransaction(id)!;
  }

  updateTransactionStatus(
    id: string,
    status: TransactionStatus,
    slot?: number,
    error?: FailureClassification,
  ): TransactionRecord | null {
    const now = Date.now();
    const tx = this.getTransaction(id);
    if (!tx) return null;

    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const params: any[] = [status, now];

    if (slot !== undefined && status !== 'failed') {
      const col = `${status}_slot`;
      updates.push(`${col} = ?`);
      params.push(slot);
    }

    const timeCol = `${status}_at`;
    if (
      status !== 'failed' &&
      !tx.timestamps[status as keyof LifecycleTimestamps]
    ) {
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
    this.db.run(
      `UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`,
      params,
    );
    this.markDirty();

    return this.getTransaction(id);
  }

  getTransaction(id: string): TransactionRecord | null {
    const stmt = this.db.prepare(
      'SELECT * FROM transactions WHERE id = ?',
    );
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return this.rowToRecord(row);
    }
    stmt.free();
    return null;
  }

  getTransactionBySignature(sig: string): TransactionRecord | null {
    const stmt = this.db.prepare(
      'SELECT * FROM transactions WHERE signature = ? ORDER BY created_at DESC LIMIT 1',
    );
    stmt.bind([sig]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return this.rowToRecord(row);
    }
    stmt.free();
    return null;
  }

  getTransactionsByStatus(
    status: TransactionStatus,
    limit = 100,
  ): TransactionRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM transactions WHERE status = ? ORDER BY created_at DESC LIMIT ?',
    );
    stmt.bind([status, limit]);
    const results: TransactionRecord[] = [];
    while (stmt.step()) {
      results.push(this.rowToRecord(stmt.getAsObject()));
    }
    stmt.free();
    return results;
  }

  getAllTransactions(limit = 1000): TransactionRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?',
    );
    stmt.bind([limit]);
    const results: TransactionRecord[] = [];
    while (stmt.step()) {
      results.push(this.rowToRecord(stmt.getAsObject()));
    }
    stmt.free();
    return results;
  }

  updateBundleId(id: string, bundleId: string): void {
    this.db.run(
      'UPDATE transactions SET bundle_id = ?, updated_at = ? WHERE id = ?',
      [bundleId, Date.now(), id],
    );
    this.markDirty();
  }

  incrementRetry(id: string): void {
    this.db.run(
      'UPDATE transactions SET retry_count = retry_count + 1, updated_at = ? WHERE id = ?',
      [Date.now(), id],
    );
    this.markDirty();
  }

  recordDecision(transactionId: string, decision: AIDecision): void {
    const id = uuid();
    this.db.run(
      'INSERT INTO decisions (id, transaction_id, action, reasoning, parameters, confidence, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        transactionId,
        decision.action,
        decision.reasoning,
        JSON.stringify(decision.parameters),
        decision.confidence,
        decision.timestamp,
      ],
    );
    this.markDirty();
  }

  getDecisions(transactionId: string): AIDecision[] {
    const stmt = this.db.prepare(
      'SELECT * FROM decisions WHERE transaction_id = ? ORDER BY timestamp ASC',
    );
    stmt.bind([transactionId]);
    const results: AIDecision[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        action: row.action as AIDecision['action'],
        reasoning: row.reasoning as string,
        parameters: JSON.parse(row.parameters as string),
        confidence: row.confidence as number,
        timestamp: row.timestamp as number,
      });
    }
    stmt.free();
    return results;
  }

  recordMetrics(
    slot: number,
    metrics: {
      totalSubmitted: number;
      totalProcessed: number;
      totalConfirmed: number;
      totalFinalized: number;
      totalFailed: number;
      avgSubmitToProcessMs?: number;
      avgProcessToConfirmMs?: number;
      avgConfirmToFinalizeMs?: number;
    },
  ): void {
    this.db.run(
      `INSERT INTO metrics (slot, total_submitted, total_processed, total_confirmed, total_finalized, total_failed,
       avg_submit_to_process_ms, avg_process_to_confirm_ms, avg_confirm_to_finalize_ms, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
      ],
    );
    this.markDirty();
  }

  getLatencyStats(): {
    avgSubmitToProcess: number | null;
    avgProcessToConfirm: number | null;
    avgConfirmToFinalize: number | null;
    count: number;
  } {
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
        avgSubmitToProcess: (row.avg_submit_process as number) ?? null,
        avgProcessToConfirm: (row.avg_process_confirm as number) ?? null,
        avgConfirmToFinalize: (row.avg_confirm_finalize as number) ?? null,
        count: (row.cnt as number) ?? 0,
      };
    }
    stmt.free();
    return { avgSubmitToProcess: null, avgProcessToConfirm: null, avgConfirmToFinalize: null, count: 0 };
  }

  exportLifecycleLogs(): Record<string, unknown>[] {
    const stmt = this.db.prepare(
      `SELECT
        id, signature, status, bundle_id, tip_lamports, retry_count, label,
        submitted_at, processed_at, confirmed_at, finalized_at,
        submitted_slot, processed_slot, confirmed_slot, finalized_slot,
        error_category, error_code, error_message
       FROM transactions ORDER BY created_at ASC`,
    );
    stmt.bind([]);
    const results: Record<string, unknown>[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  exportDecisionsLog(): Record<string, unknown>[] {
    const stmt = this.db.prepare(
      `SELECT d.*, t.signature, t.label
       FROM decisions d
       JOIN transactions t ON t.id = d.transaction_id
       ORDER BY d.timestamp ASC`,
    );
    stmt.bind([]);
    const results: Record<string, unknown>[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  close(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }
    this.save();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private rowToRecord(row: any): TransactionRecord {
    const timestamps: LifecycleTimestamps = {
      submitted: row.submitted_at as number,
      processed: row.processed_at as number | undefined,
      confirmed: row.confirmed_at as number | undefined,
      finalized: row.finalized_at as number | undefined,
    };
    const slots: LifecycleSlots = {
      submitted: row.submitted_slot as number,
      processed: row.processed_slot as number | undefined,
      confirmed: row.confirmed_slot as number | undefined,
      finalized: row.finalized_slot as number | undefined,
    };

    const deltas: LatencyDeltas = {};
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

    let error: FailureClassification | undefined;
    if (row.error_category) {
      error = {
        category: row.error_category as FailureClassification['category'],
        code: row.error_code as string,
        message: row.error_message as string,
        timestamp: timestamps.submitted,
        slot: row.error_slot as number | undefined,
      };
    }

    return {
      id: row.id as string,
      signature: row.signature as string,
      status: row.status as TransactionStatus,
      timestamps,
      slots,
      deltas,
      bundleId: row.bundle_id as string | undefined,
      tipLamports: row.tip_lamports as number,
      error,
      retryCount: row.retry_count as number,
      label: row.label as string | undefined,
    };
  }
}
