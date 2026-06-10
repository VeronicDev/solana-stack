import { FailureClassification, FailureCategory } from '../types';
export declare class FailureClassifier {
    classify(error: string, slot?: number): FailureClassification;
    classifyTxError(txError: unknown, slot?: number): FailureClassification;
    isRetryable(category: FailureCategory): boolean;
}
//# sourceMappingURL=failure-classifier.d.ts.map