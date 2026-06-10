import {
  FailureClassification,
  FailureCategory,
} from '../types';

export class FailureClassifier {
  classify(error: string, slot?: number): FailureClassification {
    const lower = error.toLowerCase();
    const timestamp = Date.now();

    if (
      lower.includes('blockhash not found') ||
      lower.includes('blockhash expired') ||
      lower.includes('expired blockhash') ||
      lower.includes('blockhash is too old') ||
      lower.includes('blockhash has expired')
    ) {
      return {
        category: 'expired_blockhash',
        code: 'BLOCKHASH_EXPIRED',
        message: error,
        timestamp,
        slot,
      };
    }

    if (
      lower.includes('computational budget') ||
      lower.includes('compute budget') ||
      lower.includes('compute exceeded') ||
      lower.includes('allocate') ||
      lower.includes('exceeded')
    ) {
      return {
        category: 'compute_exceeded',
        code: 'COMPUTE_EXCEEDED',
        message: error,
        timestamp,
        slot,
      };
    }

    if (
      lower.includes('fee') ||
      lower.includes('lamport') ||
      lower.includes('rent') ||
      lower.includes('insufficient funds')
    ) {
      return {
        category: 'fee_too_low',
        code: 'FEE_TOO_LOW',
        message: error,
        timestamp,
        slot,
      };
    }

    if (
      lower.includes('bundle') ||
      lower.includes('rejected') ||
      lower.includes('dropped') ||
      lower.includes('block engine') ||
      lower.includes('no leader')
    ) {
      return {
        category: 'bundle_rejection',
        code: 'BUNDLE_REJECTED',
        message: error,
        timestamp,
        slot,
      };
    }

    if (
      lower.includes('timeout') ||
      lower.includes('timed out') ||
      lower.includes('connection') ||
      lower.includes('econnrefused') ||
      lower.includes('econnreset') ||
      lower.includes('deadline') ||
      lower.includes('unavailable')
    ) {
      return {
        category: 'network_timeout',
        code: 'NETWORK_TIMEOUT',
        message: error,
        timestamp,
        slot,
      };
    }

    if (
      lower.includes('skip') ||
      lower.includes('leader skip') ||
      lower.includes('no leader') ||
      lower.includes('leader not available')
    ) {
      return {
        category: 'leader_skip',
        code: 'LEADER_SKIPPED',
        message: error,
        timestamp,
        slot,
      };
    }

    return {
      category: 'unknown',
      code: 'UNKNOWN',
      message: error,
      timestamp,
      slot,
    };
  }

  classifyTxError(txError: unknown, slot?: number): FailureClassification {
    if (!txError) {
      return {
        category: 'unknown',
        code: 'NO_ERROR',
        message: 'No error information available',
        timestamp: Date.now(),
        slot,
      };
    }

    const errorStr = typeof txError === 'string'
      ? txError
      : JSON.stringify(txError);

    return this.classify(errorStr, slot);
  }

  isRetryable(category: FailureCategory): boolean {
    switch (category) {
      case 'expired_blockhash':
        return true;
      case 'fee_too_low':
        return true;
      case 'bundle_rejection':
        return true;
      case 'network_timeout':
        return true;
      case 'leader_skip':
        return true;
      case 'compute_exceeded':
        return false;
      case 'unknown':
        return false;
    }
  }
}
