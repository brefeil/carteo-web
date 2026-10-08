/**
 * Pure entitlement reconciliation policy.
 *
 * No client-provided premium flags or purchase tokens are accepted here.
 * Callers must first authenticate the user and verify each purchase against
 * Apple App Store Server API or Google Play Developer API.
 *
 * Do not deploy as an entitlement writer until the transaction-id ownership
 * ledger and atomic Firestore writes are implemented.
 */
export type VerifiedStorePurchase = {
  store: "apple" | "google";
  transactionId: string;
  productId: string;
  productType: "subscription" | "lifetime";
  expiresAt: string | null;
  revoked: boolean;
  verifiedOwnerUID: string;
};

export type EntitlementSnapshot = {
  status: "active" | "inactive";
  productType: "subscription" | "lifetime";
  expiresAt: string | null;
  sourceTransactionIds: string[];
};

export function reconcileVerifiedPurchases(
  ownerUID: string,
  purchases: readonly VerifiedStorePurchase[],
  now = new Date(),
): EntitlementSnapshot {
  if (!ownerUID) throw new Error("missing-owner");
  const valid = purchases.filter(p =>
    p.verifiedOwnerUID === ownerUID &&
    p.transactionId.length > 0 &&
    !p.revoked &&
    (p.productType === "lifetime" ||
      (p.productType === "subscription" &&
        typeof p.expiresAt === "string" &&
        Number.isFinite(Date.parse(p.expiresAt)) &&
        Date.parse(p.expiresAt) > now.getTime())),
  );
  const lifetime = valid.filter(p => p.productType === "lifetime");
  if (lifetime.length) {
    return {
      status: "active",
      productType: "lifetime",
      expiresAt: null,
      sourceTransactionIds: [...new Set(lifetime.map(p => `${p.store}:${p.transactionId}`))].sort(),
    };
  }
  const subs = valid.filter(p => p.productType === "subscription");
  if (subs.length) {
    const latest = subs.reduce((a, b) =>
      Date.parse(a.expiresAt!) >= Date.parse(b.expiresAt!) ? a : b);
    return {
      status: "active",
      productType: "subscription",
      expiresAt: latest.expiresAt,
      sourceTransactionIds: [...new Set(subs.map(p => `${p.store}:${p.transactionId}`))].sort(),
    };
  }
  return {
    status: "inactive",
    productType: "subscription",
    expiresAt: null,
    sourceTransactionIds: [],
  };
}
