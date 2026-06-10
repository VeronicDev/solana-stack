import EventEmitter from 'events';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage,
  LAMPORTS_PER_SOL,
  SystemProgram,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  ServiceEvent,
  BundleSubmissionResult,
} from '../types';
import { Observability } from './observability';

let _jitoSdk: any = null;
async function getJitoSdk(): Promise<any> {
  if (!_jitoSdk) {
    _jitoSdk = await import('jito-ts');
  }
  return _jitoSdk;
}

interface JitoConfig {
  blockEngineUrl: string;
  tipAccountAddress: string;
  authKeypairPath?: string;
}

export class BundleEngine extends EventEmitter {
  private connection: Connection;
  private config: JitoConfig;
  private log: Observability;
  private wallet: Keypair | null = null;
  private client: any = null;

  constructor(
    connection: Connection,
    config: JitoConfig,
    log: Observability,
  ) {
    super();
    this.connection = connection;
    this.config = config;
    this.log = log;
  }

  async initialize(walletKeypair?: Keypair): Promise<void> {
    if (walletKeypair) {
      this.wallet = walletKeypair;
    }

    try {
      const jito = await getJitoSdk();
      const blockEngineUrl = this.config.blockEngineUrl.replace(/^https?:\/\//, '');

      if (this.config.authKeypairPath) {
        const fs = await import('fs');
        const authKeypairData = JSON.parse(
          fs.readFileSync(this.config.authKeypairPath, 'utf-8'),
        );
        const authKeypair = Keypair.fromSecretKey(
          new Uint8Array(authKeypairData),
        );
        this.client = jito.searcher.searcherClient(blockEngineUrl, authKeypair, {
          'grpc.max_receive_message_length': 64 * 1024 * 1024,
        });
      } else {
        this.client = jito.searcher.searcherClient(blockEngineUrl, undefined, {
          'grpc.max_receive_message_length': 64 * 1024 * 1024,
        });
      }

      this.log.info('Bundle engine initialized', {
        blockEngineUrl: this.config.blockEngineUrl,
        hasAuth: !!this.config.authKeypairPath,
      });
    } catch (err) {
      this.log.error('Failed to initialize bundle engine', {
        error: (err as Error).message,
      });
      throw err;
    }
  }

  async buildMemoTransaction(
    recentBlockhash: string,
    message: string,
  ): Promise<VersionedTransaction> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const memoIx = new TransactionInstruction({
      programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
      ],
      data: Buffer.from(message, 'utf-8'),
    });

    const cuBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 200_000,
    });

    const cuPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 1_000,
    });

    const instructions = [cuBudgetIx, cuPriceIx, memoIx];
    const messageV0 = new TransactionMessage({
      payerKey: this.wallet.publicKey,
      recentBlockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([this.wallet]);

    return tx;
  }

  async buildTransferTransaction(
    recentBlockhash: string,
    destination: PublicKey,
    amountLamports: number,
  ): Promise<VersionedTransaction> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const transferIx = SystemProgram.transfer({
      fromPubkey: this.wallet.publicKey,
      toPubkey: destination,
      lamports: amountLamports,
    });

    const cuBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 200_000,
    });

    const cuPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 1_000,
    });

    const instructions = [cuBudgetIx, cuPriceIx, transferIx];
    const messageV0 = new TransactionMessage({
      payerKey: this.wallet.publicKey,
      recentBlockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([this.wallet]);

    return tx;
  }

  addTipInstruction(
    tx: VersionedTransaction,
    tipLamports: number,
  ): VersionedTransaction {
    const tipAccount = new PublicKey(this.config.tipAccountAddress);

    const tipIx = SystemProgram.transfer({
      fromPubkey: this.wallet!.publicKey,
      toPubkey: tipAccount,
      lamports: tipLamports,
    });

    const message = TransactionMessage.decompile(tx.message);
    message.instructions.push(tipIx);

    const newMessage = message.compileToV0Message();
    const newTx = new VersionedTransaction(newMessage);
    newTx.sign([this.wallet!]);

    return newTx;
  }

  async submitBundle(
    transactions: VersionedTransaction[],
    tipLamports: number,
  ): Promise<BundleSubmissionResult> {
    if (!this.client) {
      throw new Error('Bundle engine not initialized. Call initialize() first.');
    }

    const startTime = Date.now();

    try {
      const txsWithTip = transactions.map((tx) =>
        this.addTipInstruction(tx, tipLamports),
      );

      const { Bundle } = (await import('jito-ts')).bundle;
      const bundle = new Bundle(txsWithTip, txsWithTip.length);

      const result = await this.client.sendBundle(bundle);

      if (!result.ok) {
        throw new Error(result.error?.message ?? 'Bundle submission rejected');
      }

      const signatures = txsWithTip.map((tx) =>
        Buffer.from(tx.signatures[0]).toString('hex'),
      );

      const submission: BundleSubmissionResult = {
        bundleId: result.value ?? `bundle_${Date.now()}`,
        signatures,
        timestamp: Date.now(),
        success: true,
      };

      this.log.info('Bundle submitted', {
        bundleId: submission.bundleId,
        signatures: submission.signatures,
        tipLamports,
        durationMs: Date.now() - startTime,
      });

      this.emit(ServiceEvent.BUNDLE_SUBMITTED, submission);
      return submission;
    } catch (err) {
      const error = err as Error;
      this.log.error('Bundle submission failed', {
        error: error.message,
        durationMs: Date.now() - startTime,
      });

      const submission: BundleSubmissionResult = {
        bundleId: '',
        signatures: [],
        timestamp: Date.now(),
        success: false,
        error: error.message,
      };

      this.emit(ServiceEvent.BUNDLE_RESULT, submission);
      return submission;
    }
  }

  async getRecentBlockhash(): Promise<string> {
    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    return blockhash;
  }

  async getRecentBlockhashWithExpiry(): Promise<{
    blockhash: string;
    lastValidBlockHeight: number;
  }> {
    const result = await this.connection.getLatestBlockhash('confirmed');
    return result;
  }

  getTipAccount(): PublicKey {
    return new PublicKey(this.config.tipAccountAddress);
  }
}
