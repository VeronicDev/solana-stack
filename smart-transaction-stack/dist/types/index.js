"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BLOCKHASH_EXPIRY_SLOTS = exports.SECONDS_PER_SLOT = exports.SLOTS_PER_EPOCH = exports.SYSTEM_PROMPT = exports.JITO_KNOWN_VALIDATORS = exports.ServiceEvent = void 0;
var ServiceEvent;
(function (ServiceEvent) {
    ServiceEvent["SLOT_UPDATE"] = "slot_update";
    ServiceEvent["BLOCK_PRODUCED"] = "block_produced";
    ServiceEvent["TRANSACTION_SEEN"] = "transaction_seen";
    ServiceEvent["LEADER_CHANGE"] = "leader_change";
    ServiceEvent["BUNDLE_SUBMITTED"] = "bundle_submitted";
    ServiceEvent["BUNDLE_RESULT"] = "bundle_result";
    ServiceEvent["LIFECYCLE_UPDATE"] = "lifecycle_update";
    ServiceEvent["FAILURE_DETECTED"] = "failure_detected";
    ServiceEvent["AI_DECISION"] = "ai_decision";
    ServiceEvent["METRICS_UPDATE"] = "metrics_update";
})(ServiceEvent || (exports.ServiceEvent = ServiceEvent = {}));
exports.JITO_KNOWN_VALIDATORS = [
    'DfXygSm4jCVNCsmb4sP3tB1G6Vvj4wKBEkJK5jNqNqVq',
    '3dpdQ8fWgP1F5qW7GkCjKj7XJxY9Z5Q8vKqK7XJxY9Z5Q8vKqK',
    '7Z1b8Ff5g6h7j8k9l0q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l',
];
exports.SYSTEM_PROMPT = `You are an AI agent managing a Solana smart transaction stack.
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
exports.SLOTS_PER_EPOCH = 432000;
exports.SECONDS_PER_SLOT = 0.4;
exports.BLOCKHASH_EXPIRY_SLOTS = 151;
//# sourceMappingURL=index.js.map