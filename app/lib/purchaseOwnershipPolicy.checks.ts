import { decidePurchaseClaim, type StoredPurchaseClaim } from "./purchaseOwnershipPolicy";
import type { VerifiedStorePurchase } from "./entitlementReconciliation";

const ownerUID = "uid-a";
const purchase: VerifiedStorePurchase = {
  store: "apple",
  transactionId: "12345",
  productId: "carteo_premium_monthly",
  productType: "subscription",
  expiresAt: "2027-01-01T00:00:00Z",
  revoked: false,
  verifiedOwnerUID: ownerUID,
};
const existing: StoredPurchaseClaim = {
  ownerUID, store: "apple", originalTransactionId: "12345",
};
function assert(value: boolean, message: string) {
  if (!value) throw new Error(message);
}
export function runPurchaseOwnershipPolicyChecks() {
  const fresh = decidePurchaseClaim(ownerUID, purchase, "12345", null);
  assert(fresh.allowed && !fresh.alreadyOwned, "new valid claim");
  const same = decidePurchaseClaim(ownerUID, purchase, "12345", existing);
  assert(same.allowed && same.alreadyOwned, "same account idempotent");
  const other = decidePurchaseClaim("uid-b", purchase, "12345", existing);
  assert(!other.allowed, "reject wrong verified owner");
  const reassigned = decidePurchaseClaim(ownerUID, purchase, "12345", { ...existing, ownerUID: "uid-b" });
  assert(!reassigned.allowed, "reject already claimed by other account");
  const wrongStore = decidePurchaseClaim(ownerUID, purchase, "12345", { ...existing, store: "google" });
  assert(!wrongStore.allowed, "reject mismatched store");
  const invalid = decidePurchaseClaim(ownerUID, purchase, "../x", null);
  assert(!invalid.allowed, "reject unsafe ledger key");
  const revoked = decidePurchaseClaim(ownerUID, { ...purchase, revoked: true }, "12345", null);
  assert(!revoked.allowed, "reject revoked purchase");
}
