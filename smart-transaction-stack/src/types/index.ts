import { VersionedTransaction } from '@solana/web3.js';

export type TransactionStatus =
  | 'submitted'
  | 'processed'
  | 'confirmed'
  | 'finalized'
  | 'failed';

export type FailureCategory =
  | 'expired_blockhash'
  | 'compute_exceeded'
  | 'fee_too_low'
  | 'bundle_rejection'
  | 'network_timeout'
  | 'leader_skip'
  | 'unknown';

export type AIAction =
  | 'retry'
  | 'abort'
  | 'adjust_tip'
  | 'refresh_blockhash'
  | 'adjust_timing';

export interface FailureClassification {
  category: FailureCategory;
  code: string;
  message: string;
  timestamp: number;
  slot?: number;
}

export interface LifecycleTimestamps {
  submitted: number;
  processed?: number;
  confirmed?: number;
  finalized?: number;
}

export interface LifecycleSlots {
  submitted: number;
  processed?: number;
  confirmed?: number;
  finalized?: number;
}

export interface LatencyDeltas {
  submittedToProcessed?: number;
  processedToConfirmed?: number;
  confirmedToFinalized?: number;
  totalFromSubmitted?: number;
}

export interface TransactionRecord {
  id: string;
  signature: string;
  status: TransactionStatus;
  timestamps: LifecycleTimestamps;
  slots: LifecycleSlots;
  deltas?: LatencyDeltas;
  bundleId?: string;
  tipLamports: number;
  error?: FailureClassification;
  retryCount: number;
  label?: string;
}

export interface AIDecision {
  action: AIAction;
  reasoning: string;
  parameters: Record<string, unknown>;
  confidence: number;
  timestamp: number;
}

export interface NetworkConditions {
  currentSlot: number;
  currentLeader: string;
  nextJitoLeaderSlot: number;
  slotsUntilJito: number;
  recentTipPercentile: number;
  congestionLevel: 'low' | 'medium' | 'high' | 'extreme';
}

export interface BundleSubmissionResult {
  bundleId: string;
  signatures: string[];
  slot?: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

export interface YellowstoneSlotEvent {
  slot: number;
  parent: number;
  status: 'processed' | 'confirmed' | 'finalized';
  timestamp: number;
}

export interface YellowstoneBlockEvent {
  slot: number;
  blockhash: string;
  blockTime?: number;
  parentSlot: number;
  timestamp: number;
}

export interface YellowstoneTransactionEvent {
  signature: string;
  slot: number;
  status: 'processed' | 'confirmed' | 'finalized';
  err?: unknown;
  timestamp: number;
  meta?: {
    fee: number;
    computeUnitsConsumed?: number;
    logMessages?: string[];
  };
}

export interface PendingTransaction {
  transactions: VersionedTransaction[];
  bundleId?: string;
  retryCount: number;
  lastSubmittedAt: number;
  lastBlockhash: string;
  tipLamports: number;
  failureHistory: FailureClassification[];
  decisions: AIDecision[];
  label?: string;
}

export interface StackConfig {
  solana: {
    rpcUrl: string;
    wsUrl: string;
  };
  yellowstone: {
    endpoint: string;
    xToken?: string;
    reconnectDelayMs: number;
    maxReconnectAttempts: number;
    backpressureHighWater: number;
  };
  jito: {
    blockEngineUrl: string;
    tipAccountAddress: string;
    authKeypairPath?: string;
  };
  wallet: {
    privateKey?: string;
  };
  ai: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  db: {
    path: string;
  };
  tip: {
    defaultLamports: number;
    minLamports: number;
    maxLamports: number;
  };
  demo?: {
    faultInjectionEnabled: boolean;
  };
}

export enum ServiceEvent {
  SLOT_UPDATE = 'slot_update',
  BLOCK_PRODUCED = 'block_produced',
  TRANSACTION_SEEN = 'transaction_seen',
  LEADER_CHANGE = 'leader_change',
  BUNDLE_SUBMITTED = 'bundle_submitted',
  BUNDLE_RESULT = 'bundle_result',
  LIFECYCLE_UPDATE = 'lifecycle_update',
  FAILURE_DETECTED = 'failure_detected',
  AI_DECISION = 'ai_decision',
  METRICS_UPDATE = 'metrics_update',
}

export const JITO_KNOWN_VALIDATORS: string[] = [
  'DfXygSm4jCVNCsmb4sP3tB1G6Vvj4wKBEkJK5jNqNqVq',
  '3dpdQ8fWgP1F5qW7GkCjKj7XJxY9Z5Q8vKqK7XJxY9Z5Q8vKqK',
  '7Z1b8Ff5g6h7j8k9l0q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l',
];

export const SYSTEM_PROMPT = `You are an AI agent managing a Solana smart transaction stack.
Your role is to monitor transaction failures and network conditions, then make autonomous decisions.

FAILURE CATEGORIES:
- expired_blockhash: The blockhash used is no longer valid (more than 151 slots old).
- compute_exceeded: Transaction exceeded compute budget.
- fee_too_low: Transaction fee was insufficient for network conditions.
- bundle_rejection: Jito block engine rejected the bundle.
- network_timeout: Connection timed out during submission.
- leader_skip: The current leader skipped their slot.
- unknown: Unclassified error.

AVAILABLE ACTIONS:
- retry: Re-submit the transaction with current parameters.
- abort: Permanently abandon this transaction.
- adjust_tip: Modify the tip amount (up or down).
- refresh_blockhash: Get a new recent blockhash before retry.
- adjust_timing: Change the submission timing strategy.

NETWORK CONTEXT:
- currentSlot: Current chain slot
- currentLeader: Current block producer
- nextJitoLeaderSlot: Slot of next Jito-enabled leader
- slotsUntilJito: How many slots until a Jito leader
- recentTipPercentile: Recent successful tip level (p50)
- congestionLevel: Network congestion

Respond with a JSON object containing:
{
  "action": string,
  "reasoning": string,
  "parameters": object,
  "confidence": number (0-1)
}

For expired_blockhash, ALWAYS recommend refresh_blockhash first.
For bundle_rejection with fee/tip issues, ALWAYS consider adjust_tip.
For leader_skip, ALWAYS recommend adjust_timing to wait for next leader.
For compute_exceeded, the transaction itself needs modification (abort or note).
For network_timeout, recommend retry with adjusted_timing.`;

export const SLOTS_PER_EPOCH = 432000;
export const SECONDS_PER_SLOT = 0.4;
export const BLOCKHASH_EXPIRY_SLOTS = 151;
