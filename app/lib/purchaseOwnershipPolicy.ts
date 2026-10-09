import type { VerifiedStorePurchase } from "./entitlementReconciliation";

/**
 * Store transaction ownership policy. All inputs must come from trusted
 * server-side storage and verified store responses.
 *
 * This module does NOT persist claims. Production MUST enforce this policy
 * inside a Firestore transaction on a server-only ownership ledger.
 */
export type StoredPurchaseClaim = {
  ownerUID: string;
  store: "apple" | "google";
  originalTransactionId: string;
};

export type PurchaseClaimDecision =
  | { allowed: true; claimKey: string; alreadyOwned: boolean }
  | { allowed: false; reason: "invalid" | "different-owner" };

export function purchaseClaimKey(
  store: "apple" | "google",
  originalTransactionId: string,
): string {
  if (!/^[A-Za-z0-9._:-]{1,256}$/.test(originalTransactionId)) {
    throw new Error("invalid-transaction-id");
  }
  return `${store}:${originalTransactionId}`;
}

export function decidePurchaseClaim(
  ownerUID: string,
  purchase: VerifiedStorePurchase,
  originalTransactionId: string,
  existing: StoredPurchaseClaim | null,
): PurchaseClaimDecision {
  if (!ownerUID || purchase.verifiedOwnerUID !== ownerUID ||
      !purchase.transactionId || purchase.revoked ||
      !originalTransactionId) {
    return { allowed: false, reason: "invalid" };
  }
  let claimKey: string;
  try {
    claimKey = purchaseClaimKey(purchase.store, originalTransactionId);
  } catch {
    return { allowed: false, reason: "invalid" };
  }
  if (existing && (
    existing.ownerUID !== ownerUID ||
    existing.store !== purchase.store ||
    existing.originalTransactionId !== originalTransactionId
  )) {
    return { allowed: false, reason: "different-owner" };
  }
  return { allowed: true, claimKey, alreadyOwned: existing !== null };
}
