import type { VerifiedStorePurchase } from "./entitlementReconciliation";

/**
 * Maps a transaction ALREADY cryptographically verified by Apple's official
 * SignedDataVerifier.verifyAndDecodeTransaction() to the shared policy model.
 *
 * NEVER pass decoded JWTs, unverified JSON or client-provided transaction
 * fields to this function. Only invoke from the trusted verifier integration.
 *
 * This module intentionally does not perform JWS verification. The official
 * Apple library, root CA bundle and OCSP checks must be integrated first.
 */
export type AppleVerifiedTransaction = {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  bundleId?: string;
  environment?: string;
  appAccountToken?: string;
  expiresDate?: number;
  revocationDate?: number;
  isUpgraded?: boolean;
  type?: string;
};

const SUBSCRIPTIONS = new Set([
  "carteo_premium_monthly",
  "carteo_premium_yearly",
]);
const LIFETIME = "carteo_premium_lifetime_299";

export function mapVerifiedAppleTransaction(
  transaction: AppleVerifiedTransaction,
  expected: {
    firebaseUID: string;
    appAccountToken: string;
    bundleId: string;
    environment: "Sandbox" | "Production";
  },
  now = new Date(),
): VerifiedStorePurchase | null {
  if (!expected.firebaseUID || !expected.appAccountToken || !expected.bundleId) {
    throw new Error("missing-trusted-apple-identity");
  }
  if (transaction.bundleId !== expected.bundleId ||
      transaction.environment !== expected.environment ||
      transaction.appAccountToken?.toLowerCase() !== expected.appAccountToken.toLowerCase() ||
      !transaction.transactionId || !/^\d+$/.test(transaction.transactionId) ||
      !transaction.originalTransactionId || !/^\d+$/.test(transaction.originalTransactionId) ||
      transaction.revocationDate != null ||
      transaction.isUpgraded === true) {
    return null;
  }

  if (transaction.productId && SUBSCRIPTIONS.has(transaction.productId)) {
    if (transaction.type !== "Auto-Renewable Subscription" ||
        typeof transaction.expiresDate !== "number" ||
        !Number.isFinite(transaction.expiresDate) ||
        transaction.expiresDate <= now.getTime()) return null;
    return {
      store: "apple",
      transactionId: transaction.transactionId,
      productId: transaction.productId,
      productType: "subscription",
      expiresAt: new Date(transaction.expiresDate).toISOString(),
      revoked: false,
      verifiedOwnerUID: expected.firebaseUID,
    };
  }

  if (transaction.productId === LIFETIME) {
    if (transaction.type !== "Non-Consumable") return null;
    return {
      store: "apple",
      transactionId: transaction.transactionId,
      productId: LIFETIME,
      productType: "lifetime",
      expiresAt: null,
      revoked: false,
      verifiedOwnerUID: expected.firebaseUID,
    };
  }
  return null;
}
