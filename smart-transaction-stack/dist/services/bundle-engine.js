"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BundleEngine = void 0;
const events_1 = __importDefault(require("events"));
const web3_js_1 = require("@solana/web3.js");
const types_1 = require("../types");
let _jitoSdk = null;
async function getJitoSdk() {
    if (!_jitoSdk) {
        _jitoSdk = await Promise.resolve().then(() => __importStar(require('jito-ts')));
    }
    return _jitoSdk;
}
class BundleEngine extends events_1.default {
    connection;
    config;
    log;
    wallet = null;
    client = null;
    constructor(connection, config, log) {
        super();
        this.connection = connection;
        this.config = config;
        this.log = log;
    }
    async initialize(walletKeypair) {
        if (walletKeypair) {
            this.wallet = walletKeypair;
        }
        try {
            const jito = await getJitoSdk();
            const blockEngineUrl = this.config.blockEngineUrl.replace(/^https?:\/\//, '');
            if (this.config.authKeypairPath) {
                const fs = await Promise.resolve().then(() => __importStar(require('fs')));
                const authKeypairData = JSON.parse(fs.readFileSync(this.config.authKeypairPath, 'utf-8'));
                const authKeypair = web3_js_1.Keypair.fromSecretKey(new Uint8Array(authKeypairData));
                this.client = jito.searcher.searcherClient(blockEngineUrl, authKeypair, {
                    'grpc.max_receive_message_length': 64 * 1024 * 1024,
                });
            }
            else {
                this.client = jito.searcher.searcherClient(blockEngineUrl, undefined, {
                    'grpc.max_receive_message_length': 64 * 1024 * 1024,
                });
            }
            this.log.info('Bundle engine initialized', {
                blockEngineUrl: this.config.blockEngineUrl,
                hasAuth: !!this.config.authKeypairPath,
            });
        }
        catch (err) {
            this.log.error('Failed to initialize bundle engine', {
                error: err.message,
            });
            throw err;
        }
    }
    async buildMemoTransaction(recentBlockhash, message) {
        if (!this.wallet) {
            throw new Error('Wallet not initialized');
        }
        const memoIx = new web3_js_1.TransactionInstruction({
            programId: new web3_js_1.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
            keys: [
                { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
            ],
            data: Buffer.from(message, 'utf-8'),
        });
        const cuBudgetIx = web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({
            units: 200_000,
        });
        const cuPriceIx = web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 1_000,
        });
        const instructions = [cuBudgetIx, cuPriceIx, memoIx];
        const messageV0 = new web3_js_1.TransactionMessage({
            payerKey: this.wallet.publicKey,
            recentBlockhash,
            instructions,
        }).compileToV0Message();
        const tx = new web3_js_1.VersionedTransaction(messageV0);
        tx.sign([this.wallet]);
        return tx;
    }
    async buildTransferTransaction(recentBlockhash, destination, amountLamports) {
        if (!this.wallet) {
            throw new Error('Wallet not initialized');
        }
        const transferIx = web3_js_1.SystemProgram.transfer({
            fromPubkey: this.wallet.publicKey,
            toPubkey: destination,
            lamports: amountLamports,
        });
        const cuBudgetIx = web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({
            units: 200_000,
        });
        const cuPriceIx = web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 1_000,
        });
        const instructions = [cuBudgetIx, cuPriceIx, transferIx];
        const messageV0 = new web3_js_1.TransactionMessage({
            payerKey: this.wallet.publicKey,
            recentBlockhash,
            instructions,
        }).compileToV0Message();
        const tx = new web3_js_1.VersionedTransaction(messageV0);
        tx.sign([this.wallet]);
        return tx;
    }
    addTipInstruction(tx, tipLamports) {
        const tipAccount = new web3_js_1.PublicKey(this.config.tipAccountAddress);
        const tipIx = web3_js_1.SystemProgram.transfer({
            fromPubkey: this.wallet.publicKey,
            toPubkey: tipAccount,
            lamports: tipLamports,
        });
        const message = web3_js_1.TransactionMessage.decompile(tx.message);
        message.instructions.push(tipIx);
        const newMessage = message.compileToV0Message();
        const newTx = new web3_js_1.VersionedTransaction(newMessage);
        newTx.sign([this.wallet]);
        return newTx;
    }
    async submitBundle(transactions, tipLamports) {
        if (!this.client) {
            throw new Error('Bundle engine not initialized. Call initialize() first.');
        }
        const startTime = Date.now();
        try {
            const txsWithTip = transactions.map((tx) => this.addTipInstruction(tx, tipLamports));
            const { Bundle } = (await Promise.resolve().then(() => __importStar(require('jito-ts')))).bundle;
            const bundle = new Bundle(txsWithTip, txsWithTip.length);
            const result = await this.client.sendBundle(bundle);
            if (!result.ok) {
                throw new Error(result.error?.message ?? 'Bundle submission rejected');
            }
            const signatures = txsWithTip.map((tx) => Buffer.from(tx.signatures[0]).toString('hex'));
            const submission = {
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
            this.emit(types_1.ServiceEvent.BUNDLE_SUBMITTED, submission);
            return submission;
        }
        catch (err) {
            const error = err;
            this.log.error('Bundle submission failed', {
                error: error.message,
                durationMs: Date.now() - startTime,
            });
            const submission = {
                bundleId: '',
                signatures: [],
                timestamp: Date.now(),
                success: false,
                error: error.message,
            };
            this.emit(types_1.ServiceEvent.BUNDLE_RESULT, submission);
            return submission;
        }
    }
    async getRecentBlockhash() {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        return blockhash;
    }
    async getRecentBlockhashWithExpiry() {
        const result = await this.connection.getLatestBlockhash('confirmed');
        return result;
    }
    getTipAccount() {
        return new web3_js_1.PublicKey(this.config.tipAccountAddress);
    }
}
exports.BundleEngine = BundleEngine;
//# sourceMappingURL=bundle-engine.js.map