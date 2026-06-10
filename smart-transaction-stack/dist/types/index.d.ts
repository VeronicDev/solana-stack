import { VersionedTransaction } from '@solana/web3.js';
export type TransactionStatus = 'submitted' | 'processed' | 'confirmed' | 'finalized' | 'failed';
export type FailureCategory = 'expired_blockhash' | 'compute_exceeded' | 'fee_too_low' | 'bundle_rejection' | 'network_timeout' | 'leader_skip' | 'unknown';
export type AIAction = 'retry' | 'abort' | 'adjust_tip' | 'refresh_blockhash' | 'adjust_timing';
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
export declare enum ServiceEvent {
    SLOT_UPDATE = "slot_update",
    BLOCK_PRODUCED = "block_produced",
    TRANSACTION_SEEN = "transaction_seen",
    LEADER_CHANGE = "leader_change",
    BUNDLE_SUBMITTED = "bundle_submitted",
    BUNDLE_RESULT = "bundle_result",
    LIFECYCLE_UPDATE = "lifecycle_update",
    FAILURE_DETECTED = "failure_detected",
    AI_DECISION = "ai_decision",
    METRICS_UPDATE = "metrics_update"
}
export declare const JITO_KNOWN_VALIDATORS: string[];
export declare const SYSTEM_PROMPT = "You are an AI agent managing a Solana smart transaction stack.\nYour role is to monitor transaction failures and network conditions, then make autonomous decisions.\n\nFAILURE CATEGORIES:\n- expired_blockhash: The blockhash used is no longer valid (more than 151 slots old).\n- compute_exceeded: Transaction exceeded compute budget.\n- fee_too_low: Transaction fee was insufficient for network conditions.\n- bundle_rejection: Jito block engine rejected the bundle.\n- network_timeout: Connection timed out during submission.\n- leader_skip: The current leader skipped their slot.\n- unknown: Unclassified error.\n\nAVAILABLE ACTIONS:\n- retry: Re-submit the transaction with current parameters.\n- abort: Permanently abandon this transaction.\n- adjust_tip: Modify the tip amount (up or down).\n- refresh_blockhash: Get a new recent blockhash before retry.\n- adjust_timing: Change the submission timing strategy.\n\nNETWORK CONTEXT:\n- currentSlot: Current chain slot\n- currentLeader: Current block producer\n- nextJitoLeaderSlot: Slot of next Jito-enabled leader\n- slotsUntilJito: How many slots until a Jito leader\n- recentTipPercentile: Recent successful tip level (p50)\n- congestionLevel: Network congestion\n\nRespond with a JSON object containing:\n{\n  \"action\": string,\n  \"reasoning\": string,\n  \"parameters\": object,\n  \"confidence\": number (0-1)\n}\n\nFor expired_blockhash, ALWAYS recommend refresh_blockhash first.\nFor bundle_rejection with fee/tip issues, ALWAYS consider adjust_tip.\nFor leader_skip, ALWAYS recommend adjust_timing to wait for next leader.\nFor compute_exceeded, the transaction itself needs modification (abort or note).\nFor network_timeout, recommend retry with adjusted_timing.";
export declare const SLOTS_PER_EPOCH = 432000;
export declare const SECONDS_PER_SLOT = 0.4;
export declare const BLOCKHASH_EXPIRY_SLOTS = 151;
//# sourceMappingURL=index.d.ts.map