# Smart Transaction Stack - Architecture

## Overview

The Smart Transaction Stack is a modular, event-driven system for monitoring Solana in real time, detecting leader windows, submitting Jito bundles, tracking full transaction lifecycle states, classifying failures, and using an AI agent to autonomously make operational decisions.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Smart Transaction Stack                       │
│                                                                     │
│  ┌────────────────┐    ┌──────────────┐    ┌───────────────────┐   │
│  │ Yellowstone    │───▶│ Leader       │───▶│ Tip Engine        │   │
│  │ Stream Service │    │ Monitor      │    │                   │   │
│  └───────┬────────┘    └──────────────┘    └────────┬──────────┘   │
│          │                                          │              │
│          │    ┌────────────────┐    ┌──────────────┐ │              │
│          ├───▶│ Lifecycle      │◀───│ Bundle Engine │◀┘              │
│          │    │ Tracker        │    │              │                │
│          │    └───────┬────────┘    └──────┬───────┘                │
│          │            │                    │                        │
│          │    ┌───────▼────────┐    ┌──────▼───────┐                │
│          │    │ Failure        │    │ Retry        │                │
│          └───▶│ Classifier     │───▶│ Engine       │                │
│               └───────┬────────┘    └──────┬───────┘                │
│                       │                    │                        │
│               ┌───────▼────────────────────▼───────┐                │
│               │         AI Agent                    │                │
│               │  (OpenAI-compatible LLM)            │                │
│               └────────────────────────────────────┘                │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Observability                              │   │
│  │  (Winston Logs, SQLite Store, CSV Export, JSON Reports)      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Module Descriptions

### 1. Yellowstone Stream Service
- **File:** `src/services/yellowstone-stream.ts`
- **Purpose:** Maintains a persistent gRPC subscription to a Yellowstone Geyser instance
- **Subscribes to:** slots, blocks, transactions
- **Features:** Auto-reconnect with exponential backoff, configurable max reconnect attempts, backpressure buffer (bounded queue) to handle high-throughput scenarios
- **Events emitted:** `SLOT_UPDATE`, `BLOCK_PRODUCED`, `TRANSACTION_SEEN`

### 2. Leader Monitor
- **File:** `src/services/leader-monitor.ts`
- **Purpose:** Tracks the current Solana slot, identifies the current leader, predicts upcoming Jito-enabled leaders
- **Mechanism:** Fetches leader schedule from RPC via `getLeaderSchedule()`, caches per epoch, cross-references against known Jito validator identities
- **Outputs:** Network conditions including current slot, leader, next Jito slot, congestion estimate
- **Congestion estimation:** Based on epoch progress (start/end of epoch = extreme)

### 3. Dynamic Tip Engine
- **File:** `src/services/tip-engine.ts`
- **Purpose:** Calculates optimal tip amounts for Jito bundle submission
- **Inputs:** Live tip distribution from Jito Block Engine API (`/api/v1/bundles/tip_floor`), historical landing success rates, network congestion level, urgency factor
- **Algorithm:** Base = P50 tip floor × multiplier (landing rate, urgency, proximity to Jito leader, congestion)
- **No hardcoded tips** — all values derived from live network data

### 4. Bundle Engine
- **File:** `src/services/bundle-engine.ts`
- **Purpose:** Builds VersionedTransactions, wraps them in Jito bundles, submits via Jito Block Engine
- **Capabilities:** Memo transactions, SOL transfers, compute budget instructions, tip instruction injection
- **Returns:** Bundle ID, signatures, submission metadata

### 5. Lifecycle Tracker
- **File:** `src/services/lifecycle-tracker.ts`
- **Purpose:** Tracks every transaction through its complete lifecycle
- **States:** `submitted → processed → confirmed → finalized` (or `failed`)
- **Records:** Timestamps and slot numbers for each state transition
- **Computes:** Latency deltas (submit→process, process→confirm, confirm→finalize)

### 6. Failure Classifier
- **File:** `src/services/failure-classifier.ts`
- **Purpose:** Parses error messages from Jito, Yellowstone, and RPC into structured classifications
- **Categories:** `expired_blockhash`, `compute_exceeded`, `fee_too_low`, `bundle_rejection`, `network_timeout`, `leader_skip`, `unknown`
- **Retryability:** Determines if a failure type is recoverable

### 7. AI Agent
- **File:** `src/services/ai-agent.ts`
- **Purpose:** Uses an OpenAI-compatible LLM to make autonomous operational decisions
- **Inputs:** Failure classification, network conditions, retry history, pending transaction state
- **Outputs:** Structured JSON decision with action, reasoning, parameters, confidence
- **Fallback:** Rule-based fallback when LLM is unavailable
- **System prompt:** Encodes domain knowledge about Solana transaction lifecycle, failure modes, and recovery strategies

### 8. Retry Engine
- **File:** `src/services/retry-engine.ts`
- **Purpose:** Executes AI-generated decisions
- **Actions:** Retry, abort, adjust tip, refresh blockhash, adjust timing
- **Flow:** Build → Submit → Detect failure → AI decide → Execute decision → Retry

### 9. Observability
- **File:** `src/services/observability.ts`
- **Purpose:** Structured logging (Winston), metrics collection, CSV lifecycle export, JSON report generation
- **Storage:** SQLite database (via better-sqlite3) with WAL mode for concurrent access
- **Reports:** Full transaction lifecycle logs, AI decision history, latency statistics, failure breakdowns

## Data Flow

```
Yellowstone gRPC
    │
    ├── Slot Update ──▶ LeaderMonitor ──▶ NetworkConditions
    │
    ├── Transaction ──▶ LifecycleTracker ──▶ SQLite Store
    │
    └── Block ──────▶ Observability

Bundle Submission Flow:
    Build Tx ──▶ BundleEngine ──▶ Jito Block Engine
                    │
                    ▼
              Success? ──Yes──▶ LifecycleTracker
                    │
                   No
                    │
                    ▼
              FailureClassifier ──▶ AI Agent ──▶ Decision
                                                    │
                                                    ▼
                                              RetryEngine ──▶ Execute
                                                    │
                                                    ▼
                                              Resubmit ──▶ BundleEngine
```

## Database Schema

### transactions
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| signature | TEXT | Transaction signature |
| status | TEXT | submitted/processed/confirmed/finalized/failed |
| submitted_at/processed_at/confirmed_at/finalized_at | INTEGER | Unix timestamps (ms) |
| submitted_slot/processed_slot/confirmed_slot/finalized_slot | INTEGER | Slot numbers |
| bundle_id | TEXT | Jito bundle identifier |
| tip_lamports | INTEGER | Tip amount in lamports |
| error_category/code/message | TEXT | Failure classification |
| retry_count | INTEGER | Number of retries |
| label | TEXT | Optional transaction label |

### decisions
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| transaction_id | TEXT FK | References transactions |
| action | TEXT | AI decision action |
| reasoning | TEXT | AI reasoning trace |
| parameters | TEXT | JSON parameters |
| confidence | REAL | Confidence score (0-1) |
| timestamp | INTEGER | Decision timestamp |

### metrics
| Column | Type | Description |
|--------|------|-------------|
| slot | INTEGER | Current slot |
| total_submitted/processed/confirmed/finalized/failed | INTEGER | Counts |
| avg_* | REAL | Average latency deltas |
