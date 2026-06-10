import EventEmitter from 'events';
import { Connection } from '@solana/web3.js';
import {
  ServiceEvent,
  NetworkConditions,
} from '../types';
import { RollingAverage } from '../utils/metrics';
import { Observability } from './observability';

interface TipConfig {
  defaultLamports: number;
  minLamports: number;
  maxLamports: number;
}

interface TipDistribution {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p100: number;
  sampleSize: number;
}

export class TipEngine extends EventEmitter {
  private connection: Connection;
  private config: TipConfig;
  private log: Observability;
  private historicalTips: RollingAverage;
  private landingSuccess: RollingAverage;
  private lastRecommendedTip: number;
  private tipDistribution: TipDistribution | null = null;
  private blockEngineUrl: string;

  constructor(
    connection: Connection,
    config: TipConfig,
    blockEngineUrl: string,
    log: Observability,
  ) {
    super();
    this.connection = connection;
    this.config = config;
    this.blockEngineUrl = blockEngineUrl;
    this.log = log;
    this.historicalTips = new RollingAverage(200);
    this.landingSuccess = new RollingAverage(200);
    this.lastRecommendedTip = config.defaultLamports;

    this.startPolling();
  }

  private startPolling(): void {
    setInterval(() => this.fetchTipFloor(), 30_000);
    setTimeout(() => this.fetchTipFloor(), 1000);
  }

  private async fetchTipFloor(): Promise<void> {
    try {
      const url = `${this.blockEngineUrl}/api/v1/bundles/tip_floor`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        this.log.warn('Failed to fetch tip floor', {
          status: response.status,
        });
        return;
      }

      const data = (await response.json()) as Record<string, unknown>;
      if (data && typeof data === 'object' && 'landed_tips_25th' in data) {
        const t25 = Number(data.landed_tips_25th) || 0;
        const t50 = Number(data.landed_tips_50th) || 0;
        const t75 = Number(data.landed_tips_75th) || 0;
        const t95 = Number(data.landed_tips_95th) || 0;
        const count = Number(data.landed_tips_count) || 0;

        this.tipDistribution = {
          p25: t25,
          p50: t50,
          p75: t75,
          p95: t95,
          p10: t25 * 0.5,
          p100: t95 * 1.5,
          sampleSize: count,
        };

        if (t50 > 0) {
          this.historicalTips.add(t50);
        }

        this.log.debug('Tip floor updated', {
          p50: t50,
          p75: t75,
          p95: t95,
          samples: count,
        });
      }
    } catch (err) {
      this.log.warn('Failed to fetch tip distribution', {
        error: (err as Error).message,
      });
    }
  }

  recordLanding(success: boolean): void {
    this.landingSuccess.add(success ? 1 : 0);
  }

  getLandingRate(): number {
    return this.landingSuccess.average;
  }

  recommendTip(conditions?: NetworkConditions, urgency: number = 0.5): number {
    const landingRate = this.landingSuccess.average || 0.5;
    const baseTip = this.tipDistribution?.p50 ?? this.config.defaultLamports;
    const multiplier = this.calculateMultiplier(conditions, urgency, landingRate);

    let recommended = Math.floor(baseTip * multiplier);

    const congestedMultiplier = conditions && conditions.congestionLevel === 'high'
      ? 2.0
      : conditions && conditions.congestionLevel === 'extreme'
        ? 3.0
        : 1.0;
    recommended = Math.floor(recommended * congestedMultiplier);

    recommended = Math.max(this.config.minLamports, recommended);
    recommended = Math.min(this.config.maxLamports, recommended);

    this.lastRecommendedTip = recommended;

    this.emit(ServiceEvent.METRICS_UPDATE, {
      type: 'tip_recommendation',
      recommended,
      baseTip,
      multiplier,
      landingRate,
      congestionLevel: conditions?.congestionLevel,
    });

    return recommended;
  }

  private calculateMultiplier(
    conditions?: NetworkConditions,
    urgency: number = 0.5,
    landingRate: number = 0.5,
  ): number {
    let multiplier = 1.0;

    if (landingRate < 0.3) {
      multiplier *= 1.5;
    } else if (landingRate < 0.5) {
      multiplier *= 1.25;
    } else if (landingRate > 0.8) {
      multiplier *= 0.9;
    }

    multiplier *= 1 + (urgency - 0.5) * 0.5;

    if (conditions) {
      if (conditions.slotsUntilJito < 10) {
        multiplier *= 1.3;
      } else if (conditions.slotsUntilJito < 30) {
        multiplier *= 1.15;
      }
    }

    return multiplier;
  }

  getCurrentTipDistribution(): TipDistribution | null {
    return this.tipDistribution;
  }

  getAverageHistoricalTip(): number {
    return this.historicalTips.average;
  }

  getLastRecommendedTip(): number {
    return this.lastRecommendedTip;
  }
}
