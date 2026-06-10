import EventEmitter from 'events';
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { BundleSubmissionResult } from '../types';
import { Observability } from './observability';
interface JitoConfig {
    blockEngineUrl: string;
    tipAccountAddress: string;
    authKeypairPath?: string;
}
export declare class BundleEngine extends EventEmitter {
    private connection;
    private config;
    private log;
    private wallet;
    private client;
    constructor(connection: Connection, config: JitoConfig, log: Observability);
    initialize(walletKeypair?: Keypair): Promise<void>;
    buildMemoTransaction(recentBlockhash: string, message: string): Promise<VersionedTransaction>;
    buildTransferTransaction(recentBlockhash: string, destination: PublicKey, amountLamports: number): Promise<VersionedTransaction>;
    addTipInstruction(tx: VersionedTransaction, tipLamports: number): VersionedTransaction;
    submitBundle(transactions: VersionedTransaction[], tipLamports: number): Promise<BundleSubmissionResult>;
    getRecentBlockhash(): Promise<string>;
    getRecentBlockhashWithExpiry(): Promise<{
        blockhash: string;
        lastValidBlockHeight: number;
    }>;
    getTipAccount(): PublicKey;
}
export {};
//# sourceMappingURL=bundle-engine.d.ts.map