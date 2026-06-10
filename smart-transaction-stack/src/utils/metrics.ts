import { LatencyDeltas, LifecycleTimestamps } from '../types';

export function computeLatencyDeltas(timestamps: LifecycleTimestamps): LatencyDeltas {
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
  return deltas;
}

export class RollingAverage {
  private values: number[] = [];
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  add(value: number): void {
    this.values.push(value);
    if (this.values.length > this.maxSize) {
      this.values.shift();
    }
  }

  get average(): number {
    if (this.values.length === 0) return 0;
    return this.values.reduce((a, b) => a + b, 0) / this.values.length;
  }

  get percentile50(): number {
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  get percentile95(): number {
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, idx)];
  }

  get count(): number {
    return this.values.length;
  }

  get min(): number {
    return this.values.length > 0 ? Math.min(...this.values) : 0;
  }

  get max(): number {
    return this.values.length > 0 ? Math.max(...this.values) : 0;
  }
}

export class BackpressureBuffer<T> {
  private buffer: T[] = [];
  private highWater: number;
  private dropped = 0;

  constructor(highWater: number) {
    this.highWater = highWater;
  }

  push(item: T): boolean {
    if (this.buffer.length >= this.highWater) {
      this.buffer.shift();
      this.dropped++;
      return false;
    }
    this.buffer.push(item);
    return true;
  }

  drain(): T[] {
    const items = [...this.buffer];
    this.buffer = [];
    return items;
  }

  get size(): number {
    return this.buffer.length;
  }

  get totalDropped(): number {
    return this.dropped;
  }
}
