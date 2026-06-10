import { Connection, Keypair } from '@solana/web3.js';
import { loadConfig } from './config';
import { Store } from './db/store';
import {
  YellowstoneStream,
  LeaderMonitor,
  TipEngine,
  BundleEngine,
  LifecycleTracker,
  FailureClassifier,
  AIAgent,
  RetryEngine,
  Observability,
} from './services';
import { ServiceEvent } from './types';

export class SmartTransactionStack {
  public connection: Connection;
  public store: Store;
  public observability: Observability;
  public yellowstone: YellowstoneStream;
  public leaderMonitor: LeaderMonitor;
  public tipEngine: TipEngine;
  public bundleEngine: BundleEngine;
  public lifecycleTracker: LifecycleTracker;
  public failureClassifier: FailureClassifier;
  public aiAgent: AIAgent;
  public retryEngine: RetryEngine;
  private wallet: Keypair;
  private running = false;

  constructor() {
    const config = loadConfig();

    this.connection = new Connection(config.solana.rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: config.solana.wsUrl,
    });

    this.store = new Store(config.db.path);
    this.observability = new Observability(this.store);
    this.yellowstone = new YellowstoneStream(config.yellowstone, this.observability);
    this.leaderMonitor = new LeaderMonitor(this.connection, this.observability);
    this.tipEngine = new TipEngine(
      this.connection,
      config.tip,
      config.jito.blockEngineUrl,
      this.observability,
    );
    this.bundleEngine = new BundleEngine(
      this.connection,
      config.jito,
      this.observability,
    );
    this.lifecycleTracker = new LifecycleTracker(this.store, this.observability);
    this.failureClassifier = new FailureClassifier();
    this.aiAgent = new AIAgent(config.ai, this.store, this.observability);
    this.wallet = this.resolveWallet(config.wallet.privateKey);

    this.retryEngine = new RetryEngine(
      this.store,
      this.bundleEngine,
      this.tipEngine,
      this.lifecycleTracker,
      this.failureClassifier,
      this.aiAgent,
      this.observability,
      this.wallet,
    );

    this.wireEvents();
  }

  private resolveWallet(privateKey?: string): Keypair {
    if (privateKey) {
      const secretKey = Uint8Array.from(JSON.parse(privateKey));
      return Keypair.fromSecretKey(secretKey);
    }
    this.observability.warn('No wallet private key configured, generating ephemeral keypair');
    return Keypair.generate();
  }

  private wireEvents(): void {
    this.yellowstone.on(ServiceEvent.SLOT_UPDATE, (event) => {
      this.leaderMonitor.handleSlotUpdate(event);
      this.observability.trackEvent(ServiceEvent.SLOT_UPDATE, {
        slot: event.slot,
        status: event.status,
      });
    });

    this.yellowstone.on(ServiceEvent.TRANSACTION_SEEN, (event) => {
      this.lifecycleTracker.handleTransactionEvent(event);
      this.observability.trackEvent(ServiceEvent.TRANSACTION_SEEN, {
        signature: event.signature.slice(0, 16),
        status: event.status,
      });
    });

    this.yellowstone.on(ServiceEvent.BLOCK_PRODUCED, (event) => {
      this.observability.trackEvent(ServiceEvent.BLOCK_PRODUCED, {
        slot: event.slot,
        blockhash: event.blockhash.slice(0, 8),
      });
    });

    this.leaderMonitor.on(ServiceEvent.LEADER_CHANGE, (event) => {
      this.observability.trackEvent(ServiceEvent.LEADER_CHANGE, {
        slot: event.slot,
        leader: event.leader?.slice(0, 16),
        isJito: event.isJito,
        slotsUntilJito: event.slotsUntilJito,
      });
    });

    this.tipEngine.on(ServiceEvent.METRICS_UPDATE, (event) => {
      this.observability.trackEvent(ServiceEvent.METRICS_UPDATE, event);
    });
  }

  async start(): Promise<void> {
    this.running = true;
    this.observability.info('Smart Transaction Stack starting');

    await this.store.initialize();
    await this.bundleEngine.initialize(this.wallet);
    await this.aiAgent.initialize();
    await this.yellowstone.start();
    await this.leaderMonitor.start();

    this.observability.info('Smart Transaction Stack started');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.yellowstone.stop();
    this.leaderMonitor.stop();
    this.observability.info('Smart Transaction Stack stopped');
  }

  getWallet(): Keypair {
    return this.wallet;
  }

  getConnection(): Connection {
    return this.connection;
  }
}

export { loadConfig, Store };
export * from './services';
export * from './types';
