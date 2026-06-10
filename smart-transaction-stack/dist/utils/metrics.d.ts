import { LatencyDeltas, LifecycleTimestamps } from '../types';
export declare function computeLatencyDeltas(timestamps: LifecycleTimestamps): LatencyDeltas;
export declare class RollingAverage {
    private values;
    private maxSize;
    constructor(maxSize?: number);
    add(value: number): void;
    get average(): number;
    get percentile50(): number;
    get percentile95(): number;
    get count(): number;
    get min(): number;
    get max(): number;
}
export declare class BackpressureBuffer<T> {
    private buffer;
    private highWater;
    private dropped;
    constructor(highWater: number);
    push(item: T): boolean;
    drain(): T[];
    get size(): number;
    get totalDropped(): number;
}
//# sourceMappingURL=metrics.d.ts.map