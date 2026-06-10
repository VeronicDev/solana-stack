import dotenv from 'dotenv';
import path from 'path';
import { StackConfig, BLOCKHASH_EXPIRY_SLOTS } from '../types';

dotenv.config();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function parseLamports(sol: string): number {
  return Math.floor(parseFloat(sol) * 1_000_000_000);
}

export function loadConfig(): StackConfig {
  return {
    solana: {
      rpcUrl: optionalEnv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),
      wsUrl: optionalEnv('SOLANA_WS_URL', 'wss://api.mainnet-beta.solana.com'),
    },
    yellowstone: {
      endpoint: requiredEnv('YELLOWSTONE_GRPC_ENDPOINT'),
      xToken: optionalEnv('YELLOWSTONE_X_TOKEN', ''),
      reconnectDelayMs: parseInt(optionalEnv('YELLOWSTONE_RECONNECT_DELAY_MS', '2000'), 10),
      maxReconnectAttempts: parseInt(optionalEnv('YELLOWSTONE_MAX_RECONNECT', '10'), 10),
      backpressureHighWater: parseInt(optionalEnv('YELLOWSTONE_BP_HIGH_WATER', '5000'), 10),
    },
    jito: {
      blockEngineUrl: optionalEnv('JITO_BLOCK_ENGINE_URL', 'https://mainnet.block-engine.jito.wtf'),
      tipAccountAddress: optionalEnv(
        'JITO_TIP_ACCOUNT',
        '96gYZGDn1HcCqUoA1c8jMxJWkn2LxTYgW1fQbT1PqNqQ'
      ),
      authKeypairPath: optionalEnv('JITO_AUTH_KEYPAIR', ''),
    },
    wallet: {
      privateKey: optionalEnv('WALLET_PRIVATE_KEY', ''),
    },
    ai: {
      apiKey: requiredEnv('OPENAI_API_KEY'),
      baseUrl: optionalEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
      model: optionalEnv('OPENAI_MODEL', 'gpt-4o'),
    },
    db: {
      path: path.resolve(optionalEnv('DATABASE_PATH', './data/stack.db')),
    },
    tip: {
      defaultLamports: parseLamports(optionalEnv('DEFAULT_TIP_SOL', '0.001')),
      minLamports: parseLamports(optionalEnv('MIN_TIP_SOL', '0.0001')),
      maxLamports: parseLamports(optionalEnv('MAX_TIP_SOL', '0.1')),
    },
    demo: {
      faultInjectionEnabled: process.env.FAULT_INJECTION_ENABLED === 'true',
    },
  };
}

export { BLOCKHASH_EXPIRY_SLOTS };
export const LAMPORTS_PER_SOL = 1_000_000_000;
