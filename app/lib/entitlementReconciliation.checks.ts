import { reconcileVerifiedPurchases, type VerifiedStorePurchase } from "./entitlementReconciliation";

const uid = "uid-1";
const base: VerifiedStorePurchase = {
  store: "google", transactionId: "g-1", productId: "monthly",
  productType: "subscription", expiresAt: "2026-11-01T00:00:00Z",
  revoked: false, verifiedOwnerUID: uid,
};
const now = new Date("2026-10-08T00:00:00Z");
function assert(ok: boolean, reason: string) {
  if (!ok) throw new Error(reason);
}
export function runEntitlementPolicyChecks() {
  assert(reconcileVerifiedPurchases(uid, [], now).status === "inactive", "no purchases");
  assert(reconcileVerifiedPurchases(uid, [base], now).status === "active", "active subscription");
  assert(reconcileVerifiedPurchases(uid, [{ ...base, expiresAt: "2026-09-01T00:00:00Z" }], now).status === "inactive", "expired");
  assert(reconcileVerifiedPurchases(uid, [{ ...base, revoked: true }], now).status === "inactive", "revoked");
  assert(reconcileVerifiedPurchases(uid, [{ ...base, verifiedOwnerUID: "other" }], now).status === "inactive", "wrong owner");
  assert(reconcileVerifiedPurchases(uid, [{ ...base, productType: "lifetime", expiresAt: null }], now).productType === "lifetime", "lifetime");
  assert(reconcileVerifiedPurchases(uid, [base, { ...base, transactionId: "g-2", expiresAt: "2026-12-01T00:00:00Z" }], now).expiresAt === "2026-12-01T00:00:00Z", "latest expiration");
}
