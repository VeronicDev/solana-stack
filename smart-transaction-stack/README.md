# Smart Transaction Stack

Production-grade Smart Transaction Stack for Solana with real-time monitoring, Jito bundle submission, full lifecycle tracking, failure classification, and AI-driven autonomous decision-making.

## Architecture

```
Yellowstone gRPC ──▶ Leader Monitor ──▶ Tip Engine ──▶ Bundle Engine ──▶ Jito Block Engine
                          │                                                  │
                          ▼                                                  ▼
                    Network Conditions                              Submission Result
                          │                                                  │
                          ▼                                                  ▼
                    AI Agent ◀── Failure Classifier ◀── Lifecycle Tracker
                          │
                          ▼
                    Retry Engine ──▶ Resubmit
```

For full architecture details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Modules

| Module | File | Purpose |
|--------|------|---------|
| Yellowstone Stream | `src/services/yellowstone-stream.ts` | Real-time gRPC subscription with auto-reconnect |
| Leader Monitor | `src/services/leader-monitor.ts` | Slot/leader tracking, Jito leader prediction |
| Tip Engine | `src/services/tip-engine.ts` | Dynamic tip calculation from live data |
| Bundle Engine | `src/services/bundle-engine.ts` | VersionedTransaction construction, Jito bundle submission |
| Lifecycle Tracker | `src/services/lifecycle-tracker.ts` | Transaction state machine, latency tracking |
| Failure Classifier | `src/services/failure-classifier.ts` | Structured error classification |
| AI Agent | `src/services/ai-agent.ts` | LLM-based decision making |
| Retry Engine | `src/services/retry-engine.ts` | AI-driven retry execution |
| Observability | `src/services/observability.ts` | Logging, metrics, CSV/JSON reports |

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env with YELLOWSTONE_GRPC_ENDPOINT, OPENAI_API_KEY, WALLET_PRIVATE_KEY
npm run build
npm start
```

## Demo

```bash
npm run demo
```

The demo injects a blockhash-expiry fault and demonstrates the AI agent detecting, explaining, and recovering from the failure.

## Setup

See [docs/SETUP.md](docs/SETUP.md) for detailed setup instructions.

## Questions

### 1. What does processed→confirmed latency measure?

**processed→confirmed latency** measures the time (in milliseconds) between when a transaction is first observed in a Solana block (`processed` — the leader has included it in their block) and when that block receives supermajority vote confirmation (`confirmed` — >2/3 of validators have voted for the block).

This delta represents:
- **Network propagation delay** for the block to reach validators
- **Voting time** for validators to process and vote on the block
- **Optimistic confirmation** — how quickly the network reaches probabilistic finality

A high processed→confirmed latency indicates network congestion, slow validator voting, or geographic dispersion of validators. Under normal Solana mainnet conditions, this is typically 400–800ms (1–2 slots). Values above 2 seconds may indicate network issues.

This is distinct from **submit→processed** latency, which measures how long the bundle engine waits for a Jito leader to include the transaction. High submit→processed latency often indicates tip was too low or the transaction missed its intended leader window.

### 2. Why is a finalized blockhash dangerous to use?

A **finalized blockhash** is dangerous for transaction construction because:

1. **Blockhash expiry**: Solana blockhashes expire after 151 slots (~60 seconds at 400ms/slot). A finalized blockhash is at least 32 slots old (the confirm→finalize threshold), meaning it could expire before the transaction is even submitted.

2. **No validity window**: When constructing a transaction, the blockhash must be recent enough that the transaction can be processed within the ~151-slot window. Using a finalized blockhash means you're already deep into that window — and if there's any delay in submission, the transaction will fail with "Blockhash not found."

3. **Race condition**: The gap between "latest blockhash" and "finalized blockhash" is typically 30+ slots. By the time you build, sign, bundle, and submit, the blockhash could easily expire.

4. **Safe practice**: Always use `getLatestBlockhash('confirmed')` rather than `('finalized')`. The confirmed commitment provides a blockhash recent enough to have a full ~151-slot validity window while being recent enough to reliably appear in blocks.

### 3. What happens when a Jito leader skips a slot?

When a Jito-enabled leader skips their assigned slot:

1. **Bundle queue flush**: All bundles that were submitted targeting that leader's slot are flushed/dropped by the block engine. The Jito Block Engine dispatches bundles to the current leader; if the leader skips, there's no one to process them.

2. **Bundle status**: The bundles return with a "no leader" or "skip" error. The Failure Classifier categorizes this as `leader_skip`.

3. **Lifecycle impact**: Transactions that were in the `submitted` state never transition to `processed` — they effectively disappear from the lifecycle until resubmitted.

4. **AI Agent response**: The AI Agent detects the `leader_skip` classification and typically responds with `adjust_timing` — waiting for the next Jito leader slot. The `slotsUntilJito` value from the Leader Monitor informs how long to wait.

5. **Tip implications**: Skipped slots don't necessarily mean the tip was wrong, but the AI Agent may recommend increasing the tip for the next attempt to ensure priority in the next leader's bundle queue.

6. **System behavior**: The Retry Engine does NOT immediately resubmit (that would target the same skipped slot). It waits for the next Jito leader window, recalculates the tip if needed, refreshes the blockhash (since time has passed), and resubmits.

7. **Frequency**: Leader skips are relatively rare on mainnet (~1% of slots) but become more common during network instability or at epoch boundaries. The system is designed to handle them gracefully without operator intervention.

## Requirements

- Node.js 20+
- Solana RPC endpoint
- Yellowstone gRPC endpoint (Triton or self-hosted Geyser)
- Jito Block Engine access
- OpenAI-compatible API key
- Solana wallet with funds

## Docker

```bash
docker compose -f docker/docker-compose.yml up -d
```

## License

MIT
