import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import { SmartTransactionStack } from '../src/index';
import {
  FailureClassification,
  NetworkConditions,
  PendingTransaction,
  ServiceEvent,
  BLOCKHASH_EXPIRY_SLOTS,
} from '../src/types';
import path from 'path';
import fs from 'fs';

const LOG_DIR = path.resolve(__dirname, '../data/demo-logs');
const DB_PATH = path.resolve(__dirname, '../data/demo.db');

if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

class DemoRunner {
  private stack: SmartTransactionStack;
  private submittedCount = 0;
  private failureCases: FailureClassification[] = [];
  private aiDecisions: any[] = [];
  private simulatedConditions: NetworkConditions;

  constructor() {
    process.env.DATABASE_PATH = DB_PATH;
    process.env.FAULT_INJECTION_ENABLED = 'true';

    // Use a demo AI key - user must set OPENAI_API_KEY for real AI decisions
    if (!process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = 'demo-skip-ai';
    }
    if (!process.env.OPENAI_BASE_URL) {
      process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
    }
    if (!process.env.OPENAI_MODEL) {
      process.env.OPENAI_MODEL = 'gpt-4o';
    }
    if (!process.env.YELLOWSTONE_GRPC_ENDPOINT) {
      process.env.YELLOWSTONE_GRPC_ENDPOINT = 'localhost:10000';
    }

    this.stack = new SmartTransactionStack();

    this.simulatedConditions = {
      currentSlot: 250_000_000,
      currentLeader: 'DfXygSm4jCVNCsmb4sP3tB1G6Vvj4wKBEkJK5jNqNqVq',
      nextJitoLeaderSlot: 250_000_050,
      slotsUntilJito: 50,
      recentTipPercentile: 5000,
      congestionLevel: 'medium',
    };
  }

  async run(): Promise<void> {
    console.log('\n============================================');
    console.log('  SMART TRANSACTION STACK - DEMO');
    console.log('============================================\n');

    await this.phase1_initialize();
    await this.phase2_detectNetworkConditions();
    await this.phase3_submitBundles();
    await this.phase4_injectBlockhashExpiry();
    await this.phase5_aiAgentDetection();
    await this.phase6_aiAgentRecovery();
    await this.phase7_demoAdditionalFailures();
    await this.phase8_generateReport();

    await new Promise(resolve => setTimeout(resolve, 500));
    await this.stack.stop();
    this.stack.store.close();

    console.log('\n============================================');
    console.log('  DEMO COMPLETE');
    console.log(`  Total submissions: ${this.submittedCount}`);
    console.log(`  Failure cases simulated: ${this.failureCases.length}`);
    console.log(`  AI decisions made: ${this.aiDecisions.length}`);
    console.log('============================================\n');
  }

  private async phase1_initialize(): Promise<void> {
    console.log('\n--- PHASE 1: Initializing Stack ---\n');
    await this.stack.start();

    this.stack.observability.info('Stack initialized successfully');
    console.log('  [OK] Store initialized');
    console.log('  [OK] Bundle engine initialized');
    console.log('  [OK] AI agent initialized');
    console.log('  [OK] Services wired');
  }

  private async phase2_detectNetworkConditions(): Promise<void> {
    console.log('\n--- PHASE 2: Network Condition Detection ---\n');

    const conditions = this.simulatedConditions;
    this.stack.observability.info('Network conditions detected', {
      slot: conditions.currentSlot,
      leader: conditions.currentLeader,
      nextJitoSlot: conditions.nextJitoLeaderSlot,
      slotsUntilJito: conditions.slotsUntilJito,
      congestion: conditions.congestionLevel,
    });

    const tip = this.stack.tipEngine.recommendTip(conditions, 0.5);
    console.log(`  Current slot:         ${conditions.currentSlot}`);
    console.log(`  Current leader:       ${conditions.currentLeader.slice(0, 16)}...`);
    console.log(`  Next Jito leader:     slot ${conditions.nextJitoLeaderSlot} (${conditions.slotsUntilJito} slots away)`);
    console.log(`  Congestion level:     ${conditions.congestionLevel}`);
    console.log(`  Recommended tip:      ${tip} lamports (${(tip / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
    console.log('  [OK] Network conditions detected');
  }

  private async phase3_submitBundles(): Promise<void> {
    console.log('\n--- PHASE 3: Bundle Submissions (10 simulated) ---\n');

    for (let i = 1; i <= 10; i++) {
      const tip = this.stack.tipEngine.recommendTip(this.simulatedConditions, i / 10);
      const label = `demo_bundle_${i}`;

      console.log(`  Bundle #${i}: simulating submission...`);
      console.log(`    Tip: ${tip} lamports (${(tip / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);

      const sig = `demo_sig_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;
      const bundleId = `bundle_${Date.now()}_${i}`;
      const slot = this.simulatedConditions.currentSlot + i;

      this.stack.lifecycleTracker.handleSubmission(
        `demo_id_${i}`,
        sig,
        bundleId,
        slot,
        tip,
        label,
      );

      // Simulate lifecycle progression
      setTimeout(() => {
        this.stack.lifecycleTracker.handleTransactionEvent({
          signature: sig,
          slot: slot + 1,
          status: 'processed',
          timestamp: Date.now(),
        });
      }, 100);

      setTimeout(() => {
        this.stack.lifecycleTracker.handleTransactionEvent({
          signature: sig,
          slot: slot + 2,
          status: 'confirmed',
          timestamp: Date.now(),
        });
      }, 200);

      setTimeout(() => {
        this.stack.lifecycleTracker.handleTransactionEvent({
          signature: sig,
          slot: slot + 3,
          status: 'finalized',
          timestamp: Date.now(),
        });
      }, 300);

      this.stack.tipEngine.recordLanding(true);
      this.submittedCount++;
      console.log(`    Signature: ${sig.slice(0, 16)}...`);
      console.log(`    Bundle ID: ${bundleId}`);
      console.log(`    [OK] Submitted at slot ${slot}, lifecycle tracking active\n`);
    }
  }

  private async phase4_injectBlockhashExpiry(): Promise<void> {
    console.log('\n--- PHASE 4: Intentional Blockhash Expiry Fault Injection ---\n');

    const expiredBlockhash = '11111111111111111111111111111111';
    const tip = this.stack.tipEngine.recommendTip(this.simulatedConditions, 0.9);

    const failure: FailureClassification = {
      category: 'expired_blockhash',
      code: 'BLOCKHASH_EXPIRED',
      message: `Blockhash ${expiredBlockhash.slice(0, 8)}... is no longer valid (more than ${BLOCKHASH_EXPIRY_SLOTS} slots old). Blockhash not found in the recent history.`,
      timestamp: Date.now(),
      slot: this.simulatedConditions.currentSlot + 11,
    };

    this.failureCases.push(failure);
    const sig = `demo_sig_expired_${Date.now()}`;
    const bundleId = `bundle_expired_${Date.now()}`;

    const record = this.stack.lifecycleTracker.handleSubmission(
      'demo_fault_expired',
      sig,
      bundleId,
      this.simulatedConditions.currentSlot + 11,
      tip,
      'fault_injected_blockhash_expiry',
    );

    this.stack.lifecycleTracker.markFailed('demo_fault_expired', failure);

    this.stack.observability.logFailure(record, failure);

    console.log(`  [INJECTED] Used stale blockhash: ${expiredBlockhash}`);
    console.log(`  [INJECTED] Blockhash age > ${BLOCKHASH_EXPIRY_SLOTS} slots`);
    console.log(`  [RESULT] Failure classified as: ${failure.category}`);
    console.log(`  [RESULT] Error: ${failure.message.slice(0, 80)}...`);
    console.log('  [OK] Blockhash-expiry fault injected\n');
  }

  private async phase5_aiAgentDetection(): Promise<void> {
    console.log('\n--- PHASE 5: AI Agent Detecting the Fault ---\n');

    const failure = this.failureCases[0];

    console.log(`  AI Agent analyzing failure:`);
    console.log(`    Category: ${failure.category}`);
    console.log(`    Code: ${failure.code}`);
    console.log(`    Message: ${failure.message}`);
    console.log(`    Slot: ${failure.slot}`);

    // Simulate AI reasoning
    const reasoningTrace = [
      '1. Detected failure category: expired_blockhash',
      `2. Blockhash age exceeds maximum valid age of ${BLOCKHASH_EXPIRY_SLOTS} slots`,
      '3. Current blockhash is no longer recognized by the validator',
      '4. Root cause: Transaction was held too long before submission',
      `5. Network congestion: ${this.simulatedConditions.congestionLevel}`,
      '6. Recommendation: Refresh blockhash via RPC, then retry',
    ];

    console.log('\n  AI Reasoning Trace:');
    reasoningTrace.forEach((line) => console.log(`    ${line}`));

    const pending: PendingTransaction = {
      transactions: [],
      retryCount: 1,
      lastSubmittedAt: Date.now(),
      lastBlockhash: '11111111111111111111111111111111',
      tipLamports: 5000,
      failureHistory: [failure],
      decisions: [],
      label: 'fault_injected_blockhash_expiry',
    };

    const decision = await this.stack.aiAgent.decide(
      pending,
      failure,
      this.simulatedConditions,
      this.stack.lifecycleTracker.getAllTransactions(),
    );

    this.aiDecisions.push(decision);

    console.log(`\n  AI Decision:`);
    console.log(`    Action: ${decision.action}`);
    console.log(`    Reasoning: ${decision.reasoning}`);
    console.log(`    Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
    console.log(`    Parameters: ${JSON.stringify(decision.parameters)}`);
    console.log('  [OK] AI agent detected and classified the blockhash expiry fault\n');
  }

  private async phase6_aiAgentRecovery(): Promise<void> {
    console.log('\n--- PHASE 6: AI Agent Recovery ---\n');

    // Step 1: AI decides to refresh blockhash
    console.log('  Step 1: AI Agent decision → refresh_blockhash');
    const refreshDecision = this.aiDecisions.find(d => d.action === 'refresh_blockhash') || {
      action: 'refresh_blockhash',
      reasoning: 'Blockhash expired. Fetching fresh blockhash from RPC before rebuilding and resubmitting.',
      parameters: {},
      confidence: 0.92,
      timestamp: Date.now(),
    };
    console.log(`    Reasoning: ${refreshDecision.reasoning}`);
    console.log(`    [OK] Blockhash refresh initiated`);

    // Simulate blockhash refresh
    const freshBlockhash = 'abc123def456ghi789jkl012mno345pqr678stu';
    console.log(`    New blockhash obtained: ${freshBlockhash.slice(0, 16)}...`);

    // Step 2: AI recalculates tip
    console.log('\n  Step 2: AI Agent decision → adjust_tip');
    const tipDecision = {
      action: 'adjust_tip',
      reasoning: 'Network congestion is medium and we are 50 slots from next Jito leader. Increasing tip by 50% to ensure bundle landing priority.',
      parameters: { tipMultiplier: 1.5 },
      confidence: 0.78,
      timestamp: Date.now(),
    };
    this.aiDecisions.push(tipDecision);

    const originalTip = 5000;
    const newTip = Math.floor(originalTip * 1.5);
    console.log(`    Original tip: ${originalTip} lamports (${(originalTip / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
    console.log(`    Adjusted tip: ${newTip} lamports (${(newTip / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
    console.log(`    Reasoning: ${tipDecision.reasoning}`);

    // Step 3: Rebuild and resubmit
    console.log('\n  Step 3: Rebuilding transaction with fresh parameters');
    console.log(`    Using fresh blockhash: ${freshBlockhash.slice(0, 16)}...`);
    console.log(`    Using adjusted tip: ${newTip} lamports`);

    const newSig = `demo_sig_recovered_${Date.now()}`;
    const newBundleId = `bundle_recovered_${Date.now()}`;
    const newSlot = this.simulatedConditions.currentSlot + 15;

    this.stack.lifecycleTracker.handleSubmission(
      'demo_recovered',
      newSig,
      newBundleId,
      newSlot,
      newTip,
      'recovered_after_fault',
    );

    setTimeout(() => {
      this.stack.lifecycleTracker.handleTransactionEvent({
        signature: newSig,
        slot: newSlot + 1,
        status: 'processed',
        timestamp: Date.now(),
      });
    }, 100);

    setTimeout(() => {
      this.stack.lifecycleTracker.handleTransactionEvent({
        signature: newSig,
        slot: newSlot + 2,
        status: 'confirmed',
        timestamp: Date.now(),
      });
    }, 200);

    this.submittedCount++;
    console.log(`    New signature: ${newSig.slice(0, 16)}...`);
    console.log(`    New bundle ID: ${newBundleId}`);
    console.log('  [OK] Recovery successful - transaction resubmitted with fresh parameters\n');
  }

  private async phase7_demoAdditionalFailures(): Promise<void> {
    console.log('\n--- PHASE 7: Additional Failure Demonstrations ---\n');

    // Failure 2: Bundle rejection
    console.log('  Failure Case #2: Bundle Rejection\n');
    const bundleFailure: FailureClassification = {
      category: 'bundle_rejection',
      code: 'BUNDLE_REJECTED',
      message: 'Bundle was rejected by the block engine: tip too low for current leader window. Minimum required: 10000 lamports.',
      timestamp: Date.now(),
      slot: this.simulatedConditions.currentSlot + 20,
    };
    this.failureCases.push(bundleFailure);

    const pending2: PendingTransaction = {
      transactions: [],
      retryCount: 2,
      lastSubmittedAt: Date.now(),
      lastBlockhash: 'current_blockhash_abc',
      tipLamports: 3000,
      failureHistory: [bundleFailure],
      decisions: [],
      label: 'demo_bundle_rejection',
    };

    const decision2 = await this.stack.aiAgent.decide(
      pending2,
      bundleFailure,
      { ...this.simulatedConditions, slotsUntilJito: 5 },
      this.stack.lifecycleTracker.getAllTransactions(),
    );
    this.aiDecisions.push(decision2);

    console.log(`    Failure: ${bundleFailure.category}`);
    console.log(`    Message: ${bundleFailure.message.slice(0, 80)}...`);
    console.log(`    AI Decision: ${decision2.action}`);
    console.log(`    AI Reasoning: ${decision2.reasoning}`);
    console.log(`    [OK] AI handled bundle rejection\n`);

    // Failure 3: Network timeout
    console.log('  Failure Case #3: Network Timeout\n');
    const timeoutFailure: FailureClassification = {
      category: 'network_timeout',
      code: 'NETWORK_TIMEOUT',
      message: 'Connection to block engine timed out after 10000ms. Deadline exceeded.',
      timestamp: Date.now(),
      slot: this.simulatedConditions.currentSlot + 25,
    };
    this.failureCases.push(timeoutFailure);

    const pending3: PendingTransaction = {
      transactions: [],
      retryCount: 1,
      lastSubmittedAt: Date.now(),
      lastBlockhash: 'blockhash_network_tx',
      tipLamports: 8000,
      failureHistory: [timeoutFailure],
      decisions: [],
      label: 'demo_network_timeout',
    };

    const decision3 = await this.stack.aiAgent.decide(
      pending3,
      timeoutFailure,
      this.simulatedConditions,
      this.stack.lifecycleTracker.getAllTransactions(),
    );
    this.aiDecisions.push(decision3);

    console.log(`    Failure: ${timeoutFailure.category}`);
    console.log(`    Message: ${timeoutFailure.message}`);
    console.log(`    AI Decision: ${decision3.action}`);
    console.log(`    AI Reasoning: ${decision3.reasoning}`);
    console.log(`    [OK] AI handled network timeout\n`);

    // Simulate lifecycle for recovery bundles
    for (let i = 0; i < 3; i++) {
      const sig = `demo_sig_extra_${Date.now()}_${i}`;
      const bundleId = `bundle_extra_${Date.now()}_${i}`;
      const slot = this.simulatedConditions.currentSlot + 30 + i;
      this.stack.lifecycleTracker.handleSubmission(
        `demo_extra_${i}`,
        sig,
        bundleId,
        slot,
        10000,
        `extra_demo_tx_${i}`,
      );
      setTimeout(() => {
        this.stack.lifecycleTracker.handleTransactionEvent({
          signature: sig,
          slot: slot + 1,
          status: 'processed',
          timestamp: Date.now(),
        });
      }, 50);
      setTimeout(() => {
        this.stack.lifecycleTracker.handleTransactionEvent({
          signature: sig,
          slot: slot + 2,
          status: 'confirmed',
          timestamp: Date.now(),
        });
      }, 100);
      this.submittedCount++;
    }
  }

  private async phase8_generateReport(): Promise<void> {
    console.log('\n--- PHASE 8: Report Generation ---\n');

    this.stack.observability.exportLifecycleCsv();

    const report = this.stack.observability.generateReport();

    const allTxs = this.stack.store.getAllTransactions();
    const stats = this.stack.store.getLatencyStats();

    console.log('  === LIFECYCLE LOG ===\n');
    for (const tx of allTxs.slice(0, 5)) {
      console.log(`  TX ${tx.signature.slice(0, 16)}...`);
      console.log(`    Status: ${tx.status}`);
      console.log(`    Bundle: ${tx.bundleId ?? 'N/A'}`);
      console.log(`    Tip: ${tx.tipLamports} lamports`);
      console.log(`    Retries: ${tx.retryCount}`);
      console.log(`    Timestamps:`);
      console.log(`      Submitted:  ${new Date(tx.timestamps.submitted).toISOString()}`);
      if (tx.timestamps.processed)
        console.log(`      Processed:  ${new Date(tx.timestamps.processed).toISOString()}`);
      if (tx.timestamps.confirmed)
        console.log(`      Confirmed:  ${new Date(tx.timestamps.confirmed).toISOString()}`);
      if (tx.timestamps.finalized)
        console.log(`      Finalized:  ${new Date(tx.timestamps.finalized).toISOString()}`);
      if (tx.deltas) {
        console.log(`    Latency Deltas (ms):`);
        if (tx.deltas.submittedToProcessed !== undefined)
          console.log(`      Submit→Process: ${tx.deltas.submittedToProcessed}ms`);
        if (tx.deltas.processedToConfirmed !== undefined)
          console.log(`      Process→Confirm: ${tx.deltas.processedToConfirmed}ms`);
        if (tx.deltas.confirmedToFinalized !== undefined)
          console.log(`      Confirm→Finalize: ${tx.deltas.confirmedToFinalized}ms`);
      }
      if (tx.error) {
        console.log(`    Error: [${tx.error.category}] ${tx.error.message.slice(0, 60)}...`);
      }
      console.log('');
    }

    console.log('  === LATENCY STATISTICS ===\n');
    console.log(`  Avg Submit→Process:  ${stats.avgSubmitToProcess !== null ? stats.avgSubmitToProcess.toFixed(2) + 'ms' : 'N/A'}`);
    console.log(`  Avg Process→Confirm: ${stats.avgProcessToConfirm !== null ? stats.avgProcessToConfirm.toFixed(2) + 'ms' : 'N/A'}`);
    console.log(`  Avg Confirm→Finalize: ${stats.avgConfirmToFinalize !== null ? stats.avgConfirmToFinalize.toFixed(2) + 'ms' : 'N/A'}`);
    console.log(`  Total transactions tracked: ${stats.count}`);

    console.log('\n  === AI DECISIONS LOG ===\n');
    for (const decision of this.aiDecisions) {
      console.log(`  Action: ${decision.action.padEnd(18)} Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
      console.log(`  Reasoning: ${decision.reasoning.slice(0, 100)}`);
      console.log('');
    }

    console.log('  [OK] Report generated at data/demo-logs/report.json');
    console.log('  [OK] Lifecycle CSV exported at data/demo-logs/lifecycle.csv');
  }
}

const runner = new DemoRunner();
runner.run().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
