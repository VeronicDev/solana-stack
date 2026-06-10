import EventEmitter from 'events';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  ServiceEvent,
  YellowstoneSlotEvent,
  NetworkConditions,
  JITO_KNOWN_VALIDATORS,
  SLOTS_PER_EPOCH,
  SECONDS_PER_SLOT,
} from '../types';
import { Observability } from './observability';

interface CachedSchedule {
  epoch: number;
  schedule: Map<string, number[]>;
  slotIndices: Map<number, string>;
  fetchedAt: number;
}

export class LeaderMonitor extends EventEmitter {
  private connection: Connection;
  private log: Observability;
  private currentSlot = 0;
  private currentEpoch = 0;
  private cachedSchedule: CachedSchedule | null = null;
  private knownJitoValidators: Set<string>;
  private scheduleRefreshInterval: NodeJS.Timeout | null = null;

  constructor(connection: Connection, log: Observability) {
    super();
    this.connection = connection;
    this.log = log;
    this.knownJitoValidators = new Set(JITO_KNOWN_VALIDATORS);
  }

  async start(): Promise<void> {
    await this.refreshEpoch();
    this.scheduleRefreshInterval = setInterval(() => {
      this.refreshEpoch();
    }, 60_000);
  }

  private async refreshEpoch(): Promise<void> {
    try {
      const epochInfo = await this.connection.getEpochInfo();
      this.currentEpoch = epochInfo.epoch;

      if (
        !this.cachedSchedule ||
        this.cachedSchedule.epoch !== epochInfo.epoch
      ) {
        await this.fetchLeaderSchedule(epochInfo.epoch);
      }
    } catch (err) {
      this.log.error('Failed to refresh epoch', {
        error: (err as Error).message,
      });
    }
  }

  private async fetchLeaderSchedule(epoch: number): Promise<void> {
    try {
      const schedule = await this.connection.getLeaderSchedule();
      const scheduleMap = new Map<string, number[]>();
      const slotIndices = new Map<number, string>();

      for (const [pubkey, slots] of Object.entries(schedule)) {
        const validSlots = slots.map((s) => Number(s));
        scheduleMap.set(pubkey, validSlots);
        for (const slot of validSlots) {
          slotIndices.set(slot, pubkey);
        }
      }

      this.cachedSchedule = {
        epoch,
        schedule: scheduleMap,
        slotIndices,
        fetchedAt: Date.now(),
      };

      this.log.info('Leader schedule fetched', {
        epoch,
        numLeaders: scheduleMap.size,
        totalSlots: slotIndices.size,
      });
    } catch (err) {
      this.log.error('Failed to fetch leader schedule', {
        error: (err as Error).message,
      });
    }
  }

  handleSlotUpdate(event: YellowstoneSlotEvent): void {
    this.currentSlot = event.slot;

    const currentLeader = this.getLeaderForSlot(event.slot);
    const jitoInfo = this.getNextJitoLeader(event.slot);
    const congestionLevel = this.estimateCongestion(event.slot);

    if (currentLeader) {
      this.emit(ServiceEvent.LEADER_CHANGE, {
        slot: event.slot,
        leader: currentLeader,
        isJito: this.knownJitoValidators.has(currentLeader),
        nextJitoLeaderSlot: jitoInfo.nextSlot,
        slotsUntilJito: jitoInfo.slotsUntil,
        congestionLevel,
      });
    }
  }

  getNetworkConditions(): NetworkConditions {
    const jitoInfo = this.getNextJitoLeader(this.currentSlot);
    const leader = this.getLeaderForSlot(this.currentSlot);

    return {
      currentSlot: this.currentSlot,
      currentLeader: leader ?? '',
      nextJitoLeaderSlot: jitoInfo.nextSlot,
      slotsUntilJito: jitoInfo.slotsUntil,
      recentTipPercentile: 0,
      congestionLevel: this.estimateCongestion(this.currentSlot),
    };
  }

  private getLeaderForSlot(slot: number): string | null {
    if (!this.cachedSchedule) return null;
    return this.cachedSchedule.slotIndices.get(slot) ?? null;
  }

  private getNextJitoLeader(fromSlot: number): {
    nextSlot: number;
    slotsUntil: number;
  } {
    if (!this.cachedSchedule) {
      return { nextSlot: fromSlot + 400, slotsUntil: 400 };
    }

    const sortedSlots = Array.from(this.cachedSchedule.slotIndices.keys()).sort(
      (a, b) => a - b,
    );

    for (const slot of sortedSlots) {
      if (slot > fromSlot) {
        const leader = this.cachedSchedule.slotIndices.get(slot);
        if (leader && this.knownJitoValidators.has(leader)) {
          return { nextSlot: slot, slotsUntil: slot - fromSlot };
        }
      }
    }

    return { nextSlot: fromSlot + 400, slotsUntil: 400 };
  }

  addJitoValidator(pubkey: string): void {
    this.knownJitoValidators.add(pubkey);
  }

  setKnownJitoValidators(validators: string[]): void {
    this.knownJitoValidators = new Set(validators);
  }

  private estimateCongestion(slot: number): 'low' | 'medium' | 'high' | 'extreme' {
    if (!this.cachedSchedule) return 'medium';

    const epochStartSlot = this.currentEpoch * SLOTS_PER_EPOCH;
    const epochProgress = (slot - epochStartSlot) / SLOTS_PER_EPOCH;

    if (epochProgress < 0.05 || epochProgress > 0.95) {
      return 'extreme';
    }
    if (epochProgress < 0.15 || epochProgress > 0.85) {
      return 'high';
    }
    if (epochProgress < 0.3 || epochProgress > 0.7) {
      return 'medium';
    }
    return 'low';
  }

  getCurrentSlot(): number {
    return this.currentSlot;
  }

  isJitoSlot(slot: number): boolean {
    const leader = this.getLeaderForSlot(slot);
    return leader ? this.knownJitoValidators.has(leader) : false;
  }

  stop(): void {
    if (this.scheduleRefreshInterval) {
      clearInterval(this.scheduleRefreshInterval);
    }
  }
}
