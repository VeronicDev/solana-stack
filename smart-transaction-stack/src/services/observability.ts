import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { Store } from '../db/store';
import {
  ServiceEvent,
  TransactionRecord,
  AIDecision,
  FailureClassification,
} from '../types';

export class Observability {
  private logger: winston.Logger;
  private store: Store;
  private eventCounts: Map<string, number> = new Map();
  private logDir: string;

  constructor(store: Store, logDir = './data/logs') {
    this.store = store;
    this.logDir = logDir;
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: { service: 'smart-tx-stack' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp, service, ...meta }) => {
              const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
            }),
          ),
        }),
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024,
          maxFiles: 5,
        }),
        new winston.transports.File({
          filename: path.join(logDir, 'combined.log'),
          maxsize: 10 * 1024 * 1024,
          maxFiles: 10,
        }),
      ],
    });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }

  trackEvent(event: ServiceEvent, data?: Record<string, unknown>): void {
    const key = event.toString();
    this.eventCounts.set(key, (this.eventCounts.get(key) || 0) + 1);
    this.debug(`Event: ${event}`, { count: this.eventCounts.get(key), ...data });
  }

  logTransactionSubmission(record: TransactionRecord): void {
    this.info('Transaction submitted', {
      id: record.id,
      signature: record.signature,
      slot: record.slots.submitted,
      tipLamports: record.tipLamports,
      label: record.label,
    });
  }

  logStatusChange(
    record: TransactionRecord,
    oldStatus: string,
    newStatus: string,
  ): void {
    this.info('Transaction status changed', {
      id: record.id,
      signature: record.signature,
      from: oldStatus,
      to: newStatus,
      slot: record.slots[newStatus as keyof typeof record.slots],
      deltas: record.deltas,
    });
  }

  logFailure(
    record: TransactionRecord,
    failure: FailureClassification,
  ): void {
    this.error('Transaction failed', {
      id: record.id,
      signature: record.signature,
      category: failure.category,
      code: failure.code,
      message: failure.message,
      slot: failure.slot,
      retryCount: record.retryCount,
    });
  }

  logAIDecision(
    record: TransactionRecord,
    decision: AIDecision,
  ): void {
    this.info('AI decision', {
      id: record.id,
      signature: record.signature,
      action: decision.action,
      reasoning: decision.reasoning,
      parameters: decision.parameters,
      confidence: decision.confidence,
    });
  }

  getEventCounts(): Record<string, number> {
    const result: Record<string, number> = {};
    this.eventCounts.forEach((count, key) => {
      result[key] = count;
    });
    return result;
  }

  generateReport(): Record<string, unknown> {
    const lifecycleLogs = this.store.exportLifecycleLogs();
    const decisionsLog = this.store.exportDecisionsLog();
    const latencyStats = this.store.getLatencyStats();
    const allTxs = this.store.getAllTransactions();
    const eventCounts = this.getEventCounts();

    const statusCounts: Record<string, number> = {};
    for (const tx of allTxs) {
      statusCounts[tx.status] = (statusCounts[tx.status] || 0) + 1;
    }

    const failureCounts: Record<string, number> = {};
    for (const tx of allTxs) {
      if (tx.error) {
        failureCounts[tx.error.category] =
          (failureCounts[tx.error.category] || 0) + 1;
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalTransactions: allTxs.length,
        statusBreakdown: statusCounts,
        failureBreakdown: failureCounts,
        latencyMs: latencyStats,
        eventCounts,
      },
      lifecycleLogs,
      decisions: decisionsLog,
    };

    const reportPath = path.join(this.logDir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.info('Report generated', { path: reportPath });

    return report;
  }

  exportLifecycleCsv(): string {
    const logs = this.store.exportLifecycleLogs();
    const headers = [
      'id',
      'signature',
      'status',
      'bundle_id',
      'tip_lamports',
      'retry_count',
      'label',
      'submitted_at',
      'processed_at',
      'confirmed_at',
      'finalized_at',
      'submitted_slot',
      'processed_slot',
      'confirmed_slot',
      'finalized_slot',
      'error_category',
      'error_code',
      'error_message',
    ];

    const rows = logs.map((log) =>
      headers.map((h) => JSON.stringify(log[h] ?? '')).join(','),
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const csvPath = path.join(this.logDir, 'lifecycle.csv');
    fs.writeFileSync(csvPath, csv);
    this.info('Lifecycle CSV exported', { path: csvPath });

    return csv;
  }
}
