# Setup Guide

## Prerequisites

- Node.js 20+
- npm 10+
- A Solana RPC endpoint (Helius, Triton, or self-hosted)
- A Yellowstone gRPC endpoint (Triton or self-hosted Geyser)
- An OpenAI-compatible API key (or any LLM with OpenAI-compatible API)
- A Solana wallet with funds for transaction fees and tips

## Quick Start

### 1. Clone and Install

```bash
cd smart-transaction-stack
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Required: Yellowstone gRPC endpoint (get from Triton or your Geyser node)
YELLOWSTONE_GRPC_ENDPOINT=your.grpc.endpoint:10000
YELLOWSTONE_X_TOKEN=your_x_token_here

# Required: OpenAI-compatible API key
OPENAI_API_KEY=sk-your-key-here

# Required: Wallet private key (JSON array format)
WALLET_PRIVATE_KEY=[1,2,3,...]

# Optional: Customize these
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com
JITO_BLOCK_ENGINE_URL=https://mainnet.block-engine.jito.wtf
OPENAI_MODEL=gpt-4o
```

### 3. Build

```bash
npm run build
```

### 4. Start

```bash
npm start
```

## Running the Demo

The demo simulates the full stack with fault injection, AI agent decision-making, and recovery:

```bash
cp .env.example .env
# Edit .env with at minimum:
#   OPENAI_API_KEY=...
#   YELLOWSTONE_GRPC_ENDPOINT=...
#   WALLET_PRIVATE_KEY=...

npm run demo
```

### Demo Output

The demo will:
1. Initialize all services
2. Simulate 10 bundle submissions with lifecycle tracking
3. Inject a blockhash-expiry fault
4. Show AI agent detecting and classifying the fault
5. Show AI agent's reasoning trace
6. Execute recovery (refresh blockhash, recalculate tip, resubmit)
7. Demonstrate additional failure scenarios (bundle rejection, network timeout)
8. Generate lifecycle CSV and JSON reports

## Docker Deployment

### Build and Run

```bash
docker compose -f docker/docker-compose.yml up -d
```

### View Logs

```bash
docker compose -f docker/docker-compose.yml logs -f
```

### Stop

```bash
docker compose -f docker/docker-compose.yml down
```

## Production Configuration

### Yellowstone gRPC

For production, use a dedicated Yellowstone gRPC endpoint:
- **Triton:** Provides managed Yellowstone gRPC endpoints
- **Self-hosted:** Run your own Geyser plugin with gRPC output

### Jito Block Engine

The Jito Block Engine requires authentication for bundle submission:
1. Generate an auth keypair
2. Register it with Jito
3. Set `JITO_AUTH_KEYPAIR` to the path of the keypair file

### Monitoring

- Logs: `data/logs/combined.log`, `data/logs/error.log`
- Database: `data/stack.db`
- Reports: `data/logs/report.json`
- Lifecycle CSV: `data/logs/lifecycle.csv`

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| SOLANA_RPC_URL | No | https://api.mainnet-beta.solana.com | Solana RPC endpoint |
| SOLANA_WS_URL | No | wss://api.mainnet-beta.solana.com | Solana WebSocket endpoint |
| YELLOWSTONE_GRPC_ENDPOINT | **Yes** | - | Yellowstone gRPC server address |
| YELLOWSTONE_X_TOKEN | No | - | Yellowstone authentication token |
| YELLOWSTONE_RECONNECT_DELAY_MS | No | 2000 | Base reconnect delay |
| YELLOWSTONE_MAX_RECONNECT | No | 10 | Max reconnect attempts |
| YELLOWSTONE_BP_HIGH_WATER | No | 5000 | Backpressure buffer size |
| JITO_BLOCK_ENGINE_URL | No | https://mainnet.block-engine.jito.wtf | Jito Block Engine endpoint |
| JITO_TIP_ACCOUNT | No | 96gYZG... | Jito tip account address |
| JITO_AUTH_KEYPAIR | No | - | Path to Jito auth keypair |
| WALLET_PRIVATE_KEY | **Yes** | - | Wallet private key (JSON array) |
| OPENAI_API_KEY | **Yes** | - | OpenAI-compatible API key |
| OPENAI_BASE_URL | No | https://api.openai.com/v1 | LLM API base URL |
| OPENAI_MODEL | No | gpt-4o | LLM model name |
| DATABASE_PATH | No | ./data/stack.db | SQLite database path |
| DEFAULT_TIP_SOL | No | 0.001 | Default tip in SOL |
| MIN_TIP_SOL | No | 0.0001 | Minimum tip in SOL |
| MAX_TIP_SOL | No | 0.1 | Maximum tip in SOL |

## Architecture Diagram

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system architecture and data flow diagrams.
