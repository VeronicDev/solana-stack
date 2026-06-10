import EventEmitter from 'events';
import {
  VersionedTransaction,
  Keypair,
} from '@solana/web3.js';
import {
  ServiceEvent,
  AIDecision,
  FailureClassification,
  NetworkConditions,
  PendingTransaction,
  TransactionRecord,
  BundleSubmissionResult,
} from '../types';
import { Store } from '../db/store';
import { BundleEngine } from './bundle-engine';
import { TipEngine } from './tip-engine';
import { LifecycleTracker } from './lifecycle-tracker';
import { FailureClassifier } from './failure-classifier';
import { AIAgent } from './ai-agent';
import { Observability } from './observability';
import { v4 as uuid } from 'uuid';

export class RetryEngine extends EventEmitter {
  private store: Store;
  private bundleEngine: BundleEngine;
  private tipEngine: TipEngine;
  private lifecycleTracker: LifecycleTracker;
  private failureClassifier: FailureClassifier;
  private aiAgent: AIAgent;
  private log: Observability;
  private wallet: Keypair;
  private maxRetries = 10;
  private activeRetries: Map<string, PendingTransaction> = new Map();

  constructor(
    store: Store,
    bundleEngine: BundleEngine,
    tipEngine: TipEngine,
    lifecycleTracker: LifecycleTracker,
    failureClassifier: FailureClassifier,
    aiAgent: AIAgent,
    log: Observability,
    wallet: Keypair,
  ) {
    super();
    this.store = store;
    this.bundleEngine = bundleEngine;
    this.tipEngine = tipEngine;
    this.lifecycleTracker = lifecycleTracker;
    this.failureClassifier = failureClassifier;
    this.aiAgent = aiAgent;
    this.log = log;
    this.wallet = wallet;
  }

  async submitWithRetry(
    buildTx: (blockhash: string) => Promise<VersionedTransaction[]>,
    tipLamports: number,
    conditions: NetworkConditions,
    label?: string,
  ): Promise<{ success: boolean; record?: TransactionRecord; finalDecision?: AIDecision }> {
    const blockhash = await this.bundleEngine.getRecentBlockhash();
    const txs = await buildTx(blockhash);

    const id = uuid();
    const pending: PendingTransaction = {
      transactions: txs,
      retryCount: 0,
      lastSubmittedAt: Date.now(),
      lastBlockhash: blockhash,
      tipLamports,
      failureHistory: [],
      decisions: [],
      label,
    };

    this.activeRetries.set(id, pending);

    const result = await this.submitBundle(id, pending, conditions);
    if (result.success) {
      return { success: true, record: result.record };
    }

    while (pending.retryCount < this.maxRetries) {
      const failure = result.failure!;
      const currentConditions = result.updatedConditions ?? conditions;

      this.log.info('AI agent evaluating failure', {
        id,
        retryCount: pending.retryCount,
        failure: failure.category,
      });

      const decision = await this.aiAgent.decide(
        pending,
        failure,
        currentConditions,
        this.lifecycleTracker.getAllTransactions(),
      );

      pending.decisions.push(decision);
      this.store.recordDecision(id, decision);

      if (decision.action === 'abort') {
        this.log.info('AI agent aborted transaction', {
          id,
          reasoning: decision.reasoning,
        });
        return { success: false, finalDecision: decision };
      }

      await this.executeDecision(decision, pending, currentConditions);

      pending.retryCount++;
      this.store.incrementRetry(id);

      const retryResult = await this.submitBundle(id, pending, currentConditions);
      if (retryResult.success) {
        return { success: true, record: retryResult.record };
      }

      result.failure = retryResult.failure;
    }

    this.log.warn('Max retries reached', { id, retries: pending.retryCount });
    return { success: false };
  }

  private async submitBundle(
    id: string,
    pending: PendingTransaction,
    conditions: NetworkConditions,
  ): Promise<{
    success: boolean;
    record?: TransactionRecord;
    failure?: FailureClassification;
    updatedConditions?: NetworkConditions;
  }> {
    try {
      const result = await this.bundleEngine.submitBundle(
        pending.transactions,
        pending.tipLamports,
      );

      if (result.success) {
        const record = this.lifecycleTracker.handleSubmission(
          id,
          result.signatures[0] ?? 'unknown',
          result.bundleId,
          conditions.currentSlot,
          pending.tipLamports,
          pending.label,
        );

        this.log.info('Bundle submitted successfully', {
          id,
          bundleId: result.bundleId,
          signature: result.signatures[0],
        });

        this.tipEngine.recordLanding(true);
        return { success: true, record };
      }

      const failure = this.failureClassifier.classify(
        result.error ?? 'Unknown bundle submission error',
        conditions.currentSlot,
      );

      pending.failureHistory.push(failure);
      this.tipEngine.recordLanding(false);

      this.log.warn('Bundle submission failed', {
        id,
        failure: failure.category,
        error: failure.message,
      });

      return { success: false, failure };
    } catch (err) {
      const failure = this.failureClassifier.classify(
        (err as Error).message,
        conditions.currentSlot,
      );

      pending.failureHistory.push(failure);
      this.tipEngine.recordLanding(false);

      this.log.error('Bundle submission error', {
        id,
        failure: failure.category,
        error: (err as Error).message,
      });

      return { success: false, failure };
    }
  }

  private async executeDecision(
    decision: AIDecision,
    pending: PendingTransaction,
    conditions: NetworkConditions,
  ): Promise<void> {
    this.log.info('Executing AI decision', {
      action: decision.action,
      reasoning: decision.reasoning,
      parameters: decision.parameters,
    });

    switch (decision.action) {
      case 'refresh_blockhash': {
        const newBlockhash = await this.bundleEngine.getRecentBlockhash();
        pending.lastBlockhash = newBlockhash;
        this.log.info('Blockhash refreshed', { blockhash: newBlockhash });
        break;
      }

      case 'adjust_tip': {
        const tipMultiplier =
          (decision.parameters.tipMultiplier as number) ?? 1.5;
        pending.tipLamports = Math.floor(pending.tipLamports * tipMultiplier);

        const tipEngineTip = this.tipEngine.recommendTip(conditions, 0.8);
        pending.tipLamports = Math.max(pending.tipLamports, tipEngineTip);

        this.log.info('Tip adjusted', {
          newTip: pending.tipLamports,
          multiplier: tipMultiplier,
        });
        break;
      }

      case 'adjust_timing': {
        let waitMs = 2000;
        if (decision.parameters.waitSlots) {
          waitMs = (decision.parameters.waitSlots as number) * 400;
        } else if (decision.parameters.delayMs) {
          waitMs = decision.parameters.delayMs as number;
        }

        this.log.info('Waiting before retry', { waitMs, action: 'adjust_timing' });
        await this.sleep(waitMs);
        break;
      }

      case 'retry': {
        if (decision.parameters.delayMs) {
          await this.sleep(decision.parameters.delayMs as number);
        } else {
          await this.sleep(1000);
        }
        break;
      }

      default:
        this.log.warn('Unknown AI action', { action: decision.action });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getActiveRetries(): Map<string, PendingTransaction> {
    return this.activeRetries;
  }
}
