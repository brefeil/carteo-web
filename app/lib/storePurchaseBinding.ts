import { createHash } from "node:crypto";
import { verifyApplePurchase } from "./storeVerificationApple";
import { verifyGoogleSubscription } from "./storeVerificationGoogle";

/**
 * Authenticated caller's UID must be established by a verified Firebase ID token.
 * This module does not write entitlements: persistence requires atomic ownership
 * claims for each original Apple transaction / Google purchase token.
 */
export type PurchaseRequest =
  | { store: "apple"; transactionId: string }
  | { store: "google"; purchaseToken: string };

export async function verifyPurchaseForAccount(
  uid: string,
  request: PurchaseRequest,
  lookupExistingClaim: (claimId: string) => Promise<string | null>,
) {
  if (!uid || uid.length > 128) throw new Error("firebase-uid-required");
  const purchase = request.store === "apple"
    ? await verifyApplePurchase(request.transactionId)
    : await verifyGoogleSubscription(request.purchaseToken);
  const stableStoreId = purchase.store === "apple" ? purchase.originalTransactionId : purchase.purchaseToken;
  const claimId = createHash("sha256").update(purchase.store + ":" + stableStoreId).digest("hex");
  const currentOwner = await lookupExistingClaim(claimId);
  if (currentOwner && currentOwner !== uid) throw new Error("purchase-already-bound-to-another-account");
  return { ...purchase, uid, claimId, verified: true, status: "active" as const };
}
