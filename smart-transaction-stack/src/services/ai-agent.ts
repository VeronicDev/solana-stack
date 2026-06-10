import EventEmitter from 'events';
import {
  ServiceEvent,
  AIDecision,
  FailureClassification,
  NetworkConditions,
  TransactionRecord,
  PendingTransaction,
  SYSTEM_PROMPT,
} from '../types';
import { Store } from '../db/store';
import { Observability } from './observability';

interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class AIAgent extends EventEmitter {
  private config: AIConfig;
  private store: Store;
  private log: Observability;
  private openai: any = null;

  constructor(config: AIConfig, store: Store, log: Observability) {
    super();
    this.config = config;
    this.store = store;
    this.log = log;
  }

  async initialize(): Promise<void> {
    const OpenAI = (await import('openai')).default;
    this.openai = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });
    this.log.info('AI agent initialized', {
      model: this.config.model,
      baseUrl: this.config.baseUrl,
    });
  }

  async decide(
    pending: PendingTransaction,
    failure: FailureClassification,
    conditions: NetworkConditions,
    recentHistory: TransactionRecord[],
  ): Promise<AIDecision> {
    if (!this.openai) {
      this.log.warn('AI agent not initialized, using fallback decision');
      return this.fallbackDecision(failure, conditions);
    }

    const context = this.buildContext(pending, failure, conditions, recentHistory);

    try {
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: context },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from AI');
      }

      const decision: AIDecision = {
        ...JSON.parse(content),
        timestamp: Date.now(),
      };

      this.validateDecision(decision);

      this.log.logAIDecision(
        {
          id: '',
          signature: pending.transactions[0]?.signatures[0]?.toString() ?? '',
          status: 'submitted',
          timestamps: { submitted: Date.now() },
          slots: { submitted: 0 },
          tipLamports: pending.tipLamports,
          retryCount: pending.retryCount,
          label: pending.label,
        },
        decision,
      );

      this.emit(ServiceEvent.AI_DECISION, {
        decision,
        failure,
        conditions,
      });

      return decision;
    } catch (err) {
      this.log.error('AI decision failed', {
        error: (err as Error).message,
      });
      return this.fallbackDecision(failure, conditions);
    }
  }

  private buildContext(
    pending: PendingTransaction,
    failure: FailureClassification,
    conditions: NetworkConditions,
    recentHistory: TransactionRecord[],
  ): string {
    const recentFailures = pending.failureHistory
      .map((f) => `  - ${f.category}: ${f.message} (slot ${f.slot ?? 'N/A'})`)
      .join('\n');

    const previousDecisions = pending.decisions
      .map((d) => `  - ${d.action}: ${d.reasoning} (confidence: ${d.confidence})`)
      .join('\n');

    const recentTxSummary = recentHistory
      .slice(0, 5)
      .map(
        (tx) =>
          `  signature=${tx.signature.slice(0, 16)}... status=${tx.status} retries=${tx.retryCount} tip=${tx.tipLamports}`,
      )
      .join('\n');

    return JSON.stringify({
      currentFailure: {
        category: failure.category,
        code: failure.code,
        message: failure.message,
        slot: failure.slot,
      },
      retryCount: pending.retryCount,
      currentTipLamports: pending.tipLamports,
      recentFailures,
      previousDecisions,
      networkConditions: {
        currentSlot: conditions.currentSlot,
        currentLeader: conditions.currentLeader,
        nextJitoLeaderSlot: conditions.nextJitoLeaderSlot,
        slotsUntilJito: conditions.slotsUntilJito,
        congestionLevel: conditions.congestionLevel,
      },
      recentTransactions: recentTxSummary,
    });
  }

  private validateDecision(decision: AIDecision): void {
    const validActions = [
      'retry',
      'abort',
      'adjust_tip',
      'refresh_blockhash',
      'adjust_timing',
    ];
    if (!validActions.includes(decision.action)) {
      throw new Error(`Invalid AI action: ${decision.action}`);
    }
    if (typeof decision.reasoning !== 'string' || decision.reasoning.length < 5) {
      throw new Error('AI reasoning too short or missing');
    }
    if (
      typeof decision.confidence !== 'number' ||
      decision.confidence < 0 ||
      decision.confidence > 1
    ) {
      decision.confidence = 0.5;
    }
    if (!decision.parameters || typeof decision.parameters !== 'object') {
      decision.parameters = {};
    }
  }

  private fallbackDecision(
    failure: FailureClassification,
    conditions: NetworkConditions,
  ): AIDecision {
    const timestamp = Date.now();

    switch (failure.category) {
      case 'expired_blockhash':
        return {
          action: 'refresh_blockhash',
          reasoning:
            'Fallback: Blockhash expired. Refreshing blockhash before retry.',
          parameters: {},
          confidence: 0.8,
          timestamp,
        };

      case 'fee_too_low':
        return {
          action: 'adjust_tip',
          reasoning:
            'Fallback: Fee too low. Increasing tip to meet network minimum.',
          parameters: { tipMultiplier: 1.5 },
          confidence: 0.7,
          timestamp,
        };

      case 'bundle_rejection':
        return {
          action: 'adjust_timing',
          reasoning:
            'Fallback: Bundle rejected. Waiting for next Jito leader slot.',
          parameters: { waitSlots: conditions.slotsUntilJito + 1 },
          confidence: 0.6,
          timestamp,
        };

      case 'network_timeout':
        return {
          action: 'retry',
          reasoning:
            'Fallback: Network timeout. Retrying with same parameters.',
          parameters: { delayMs: 2000 },
          confidence: 0.5,
          timestamp,
        };

      case 'leader_skip':
        return {
          action: 'adjust_timing',
          reasoning:
            'Fallback: Leader skipped slot. Waiting for next leader window.',
          parameters: { waitSlots: Math.max(conditions.slotsUntilJito, 1) },
          confidence: 0.7,
          timestamp,
        };

      default:
        return {
          action: 'retry',
          reasoning: `Fallback: Unclassified failure "${failure.category}". Attempting retry.`,
          parameters: {},
          confidence: 0.3,
          timestamp,
        };
    }
  }
}
