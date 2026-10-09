import { mapVerifiedAppleTransaction, type AppleVerifiedTransaction } from "./appleVerifiedTransactionPolicy";

const now = new Date("2026-10-09T00:00:00Z");
const expected = {
  firebaseUID: "firebase-user-1",
  appAccountToken: "00000000-0000-4000-8000-000000000001",
  bundleId: "cloud.carteo.app",
  environment: "Sandbox" as const,
};
const valid: AppleVerifiedTransaction = {
  transactionId: "1000000123456789",
  originalTransactionId: "1000000123456789",
  productId: "carteo_premium_monthly",
  bundleId: expected.bundleId,
  environment: expected.environment,
  appAccountToken: expected.appAccountToken,
  type: "Auto-Renewable Subscription",
  expiresDate: Date.parse("2026-11-09T00:00:00Z"),
};
function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}
export function runAppleTransactionPolicyChecks(): void {
  assert(mapVerifiedAppleTransaction(valid, expected, now)?.productType === "subscription", "valid subscription");
  assert(mapVerifiedAppleTransaction({ ...valid, bundleId: "wrong.bundle" }, expected, now) === null, "wrong bundle");
  assert(mapVerifiedAppleTransaction({ ...valid, environment: "Production" }, expected, now) === null, "wrong environment");
  assert(mapVerifiedAppleTransaction({ ...valid, appAccountToken: "other" }, expected, now) === null, "wrong account token");
  assert(mapVerifiedAppleTransaction({ ...valid, revocationDate: now.getTime() }, expected, now) === null, "revoked");
  assert(mapVerifiedAppleTransaction({ ...valid, expiresDate: now.getTime() - 1 }, expected, now) === null, "expired");
  assert(mapVerifiedAppleTransaction({ ...valid, productId: "unlisted" }, expected, now) === null, "unknown product");
  assert(mapVerifiedAppleTransaction({ ...valid, isUpgraded: true }, expected, now) === null, "upgraded");
  assert(mapVerifiedAppleTransaction({
    ...valid,
    productId: "carteo_premium_lifetime_299",
    type: "Non-Consumable",
    expiresDate: undefined,
  }, expected, now)?.productType === "lifetime", "lifetime");
  assert(mapVerifiedAppleTransaction({
    ...valid,
    productId: "carteo_premium_lifetime_299",
  }, expected, now) === null, "lifetime wrong type");
}
