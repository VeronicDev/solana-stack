import EventEmitter from 'events';
import {
  ServiceEvent,
  YellowstoneSlotEvent,
  YellowstoneBlockEvent,
  YellowstoneTransactionEvent,
} from '../types';
import { BackpressureBuffer } from '../utils/metrics';
import { Observability } from './observability';

interface YellowstoneConfig {
  endpoint: string;
  xToken?: string;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  backpressureHighWater: number;
}

export class YellowstoneStream extends EventEmitter {
  private config: YellowstoneConfig;
  private log: Observability;
  private client: any = null;
  private stream: any = null;
  private reconnectAttempts = 0;
  private running = false;
  private backpressureBuffer: BackpressureBuffer<any>;

  constructor(config: YellowstoneConfig, log: Observability) {
    super();
    this.config = config;
    this.log = log;
    this.backpressureBuffer = new BackpressureBuffer(config.backpressureHighWater);
  }

  async start(): Promise<void> {
    this.running = true;
    this.log.info('Starting Yellowstone gRPC stream', {
      endpoint: this.config.endpoint,
    });
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const YellowstoneModule = await import('@triton-one/yellowstone-grpc');
      const Client = YellowstoneModule.default;
      const CommitmentLevel = YellowstoneModule.CommitmentLevel;

      const clientOptions: Record<string, unknown> = {
        'grpc.max_receive_message_length': 64 * 1024 * 1024,
      };

      this.client = new Client(
        this.config.endpoint,
        this.config.xToken,
        clientOptions,
      );

      await this.client.connect();
      this.stream = await this.client.subscribe();

      this.stream.on('data', (data: any) => {
        this.handleData(data);
      });

      this.stream.on('error', (err: Error) => {
        this.log.error('Yellowstone stream error', { error: err.message });
        this.scheduleReconnect();
      });

      this.stream.on('close', () => {
        this.log.warn('Yellowstone stream closed');
        this.scheduleReconnect();
      });

      this.stream.on('end', () => {
        this.log.warn('Yellowstone stream ended');
        this.scheduleReconnect();
      });

      const subscribeRequest = {
        slots: {
          filterByCommitment: {
            commitment: CommitmentLevel.CONFIRMED,
          },
        },
        blocks: {},
        transactions: {
          vote: false,
          failed: true,
          accountInclude: [],
          accountExclude: [],
          accountRequired: [],
        },
        commitment: CommitmentLevel.CONFIRMED,
      };

      this.stream.write(subscribeRequest);
      this.reconnectAttempts = 0;
      this.log.info('Yellowstone subscription active');
    } catch (err) {
      this.log.error('Failed to connect to Yellowstone', {
        error: (err as Error).message,
      });
      this.scheduleReconnect();
    }
  }

  private handleData(data: any): void {
    const enqueued = this.backpressureBuffer.push(data);
    if (!enqueued) {
      this.log.warn('Backpressure buffer full, dropping event');
      return;
    }

    if (data.slot !== undefined) {
      this.handleSlot(data.slot);
    }
    if (data.block !== undefined) {
      this.handleBlock(data.block);
    }
    if (data.transaction !== undefined) {
      this.handleTransaction(data.transaction);
    }
  }

  private handleSlot(slotData: any): void {
    const event: YellowstoneSlotEvent = {
      slot: slotData.slot ?? 0,
      parent: slotData.parent ?? 0,
      status: this.parseCommitment(slotData.commitment ?? 1),
      timestamp: Date.now(),
    };
    this.emit(ServiceEvent.SLOT_UPDATE, event);
  }

  private handleBlock(blockData: any): void {
    const event: YellowstoneBlockEvent = {
      slot: blockData.slot ?? 0,
      blockhash: blockData.blockhash ?? '',
      blockTime: blockData.blockTime ?? undefined,
      parentSlot: blockData.parentSlot ?? 0,
      timestamp: Date.now(),
    };
    this.emit(ServiceEvent.BLOCK_PRODUCED, event);
  }

  private handleTransaction(txData: any): void {
    const signature =
      txData.signature ??
      (txData.transaction?.signatures?.[0]) ??
      '';

    const event: YellowstoneTransactionEvent = {
      signature,
      slot: txData.slot ?? 0,
      status: this.parseCommitment(txData.commitment ?? 1),
      err: txData.err ?? undefined,
      timestamp: Date.now(),
      meta: txData.meta
        ? {
            fee: txData.meta.fee ?? 0,
            computeUnitsConsumed: txData.meta.computeUnitsConsumed ?? undefined,
            logMessages: txData.meta.logMessages ?? undefined,
          }
        : undefined,
    };
    this.emit(ServiceEvent.TRANSACTION_SEEN, event);
  }

  private parseCommitment(commitment: number): 'processed' | 'confirmed' | 'finalized' {
    switch (commitment) {
      case 0:
        return 'processed';
      case 1:
        return 'confirmed';
      case 2:
        return 'finalized';
      default:
        return 'confirmed';
    }
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.log.error('Max reconnect attempts reached');
      this.running = false;
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    this.log.warn('Scheduling Yellowstone reconnect', {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    setTimeout(() => {
      if (this.running) {
        this.cleanup();
        this.connect();
      }
    }, delay);
  }

  private cleanup(): void {
    if (this.stream) {
      try {
        this.stream.destroy();
      } catch { /* ignore */ }
      this.stream = null;
    }
    if (this.client) {
      try {
        this.client.close();
      } catch { /* ignore */ }
      this.client = null;
    }
  }

  stop(): void {
    this.running = false;
    this.cleanup();
    this.log.info('Yellowstone stream stopped');
  }

  getBufferStats(): { size: number; dropped: number } {
    return {
      size: this.backpressureBuffer.size,
      dropped: this.backpressureBuffer.totalDropped,
    };
  }
}
