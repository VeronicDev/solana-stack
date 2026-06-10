"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Observability = void 0;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
class Observability {
    logger;
    store;
    eventCounts = new Map();
    logDir;
    constructor(store, logDir = './data/logs') {
        this.store = store;
        this.logDir = logDir;
        if (!fs_1.default.existsSync(logDir)) {
            fs_1.default.mkdirSync(logDir, { recursive: true });
        }
        this.logger = winston_1.default.createLogger({
            level: 'info',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
            defaultMeta: { service: 'smart-tx-stack' },
            transports: [
                new winston_1.default.transports.Console({
                    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.printf(({ level, message, timestamp, service, ...meta }) => {
                        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
                        return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
                    })),
                }),
                new winston_1.default.transports.File({
                    filename: path_1.default.join(logDir, 'error.log'),
                    level: 'error',
                    maxsize: 10 * 1024 * 1024,
                    maxFiles: 5,
                }),
                new winston_1.default.transports.File({
                    filename: path_1.default.join(logDir, 'combined.log'),
                    maxsize: 10 * 1024 * 1024,
                    maxFiles: 10,
                }),
            ],
        });
    }
    info(message, meta) {
        this.logger.info(message, meta);
    }
    warn(message, meta) {
        this.logger.warn(message, meta);
    }
    error(message, meta) {
        this.logger.error(message, meta);
    }
    debug(message, meta) {
        this.logger.debug(message, meta);
    }
    trackEvent(event, data) {
        const key = event.toString();
        this.eventCounts.set(key, (this.eventCounts.get(key) || 0) + 1);
        this.debug(`Event: ${event}`, { count: this.eventCounts.get(key), ...data });
    }
    logTransactionSubmission(record) {
        this.info('Transaction submitted', {
            id: record.id,
            signature: record.signature,
            slot: record.slots.submitted,
            tipLamports: record.tipLamports,
            label: record.label,
        });
    }
    logStatusChange(record, oldStatus, newStatus) {
        this.info('Transaction status changed', {
            id: record.id,
            signature: record.signature,
            from: oldStatus,
            to: newStatus,
            slot: record.slots[newStatus],
            deltas: record.deltas,
        });
    }
    logFailure(record, failure) {
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
    logAIDecision(record, decision) {
        this.info('AI decision', {
            id: record.id,
            signature: record.signature,
            action: decision.action,
            reasoning: decision.reasoning,
            parameters: decision.parameters,
            confidence: decision.confidence,
        });
    }
    getEventCounts() {
        const result = {};
        this.eventCounts.forEach((count, key) => {
            result[key] = count;
        });
        return result;
    }
    generateReport() {
        const lifecycleLogs = this.store.exportLifecycleLogs();
        const decisionsLog = this.store.exportDecisionsLog();
        const latencyStats = this.store.getLatencyStats();
        const allTxs = this.store.getAllTransactions();
        const eventCounts = this.getEventCounts();
        const statusCounts = {};
        for (const tx of allTxs) {
            statusCounts[tx.status] = (statusCounts[tx.status] || 0) + 1;
        }
        const failureCounts = {};
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
        const reportPath = path_1.default.join(this.logDir, 'report.json');
        fs_1.default.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        this.info('Report generated', { path: reportPath });
        return report;
    }
    exportLifecycleCsv() {
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
        const rows = logs.map((log) => headers.map((h) => JSON.stringify(log[h] ?? '')).join(','));
        const csv = [headers.join(','), ...rows].join('\n');
        const csvPath = path_1.default.join(this.logDir, 'lifecycle.csv');
        fs_1.default.writeFileSync(csvPath, csv);
        this.info('Lifecycle CSV exported', { path: csvPath });
        return csv;
    }
}
exports.Observability = Observability;
//# sourceMappingURL=observability.js.map