"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackpressureBuffer = exports.RollingAverage = void 0;
exports.computeLatencyDeltas = computeLatencyDeltas;
function computeLatencyDeltas(timestamps) {
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
    return deltas;
}
class RollingAverage {
    values = [];
    maxSize;
    constructor(maxSize = 100) {
        this.maxSize = maxSize;
    }
    add(value) {
        this.values.push(value);
        if (this.values.length > this.maxSize) {
            this.values.shift();
        }
    }
    get average() {
        if (this.values.length === 0)
            return 0;
        return this.values.reduce((a, b) => a + b, 0) / this.values.length;
    }
    get percentile50() {
        if (this.values.length === 0)
            return 0;
        const sorted = [...this.values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    }
    get percentile95() {
        if (this.values.length === 0)
            return 0;
        const sorted = [...this.values].sort((a, b) => a - b);
        const idx = Math.ceil(sorted.length * 0.95) - 1;
        return sorted[Math.max(0, idx)];
    }
    get count() {
        return this.values.length;
    }
    get min() {
        return this.values.length > 0 ? Math.min(...this.values) : 0;
    }
    get max() {
        return this.values.length > 0 ? Math.max(...this.values) : 0;
    }
}
exports.RollingAverage = RollingAverage;
class BackpressureBuffer {
    buffer = [];
    highWater;
    dropped = 0;
    constructor(highWater) {
        this.highWater = highWater;
    }
    push(item) {
        if (this.buffer.length >= this.highWater) {
            this.buffer.shift();
            this.dropped++;
            return false;
        }
        this.buffer.push(item);
        return true;
    }
    drain() {
        const items = [...this.buffer];
        this.buffer = [];
        return items;
    }
    get size() {
        return this.buffer.length;
    }
    get totalDropped() {
        return this.dropped;
    }
}
exports.BackpressureBuffer = BackpressureBuffer;
//# sourceMappingURL=metrics.js.map