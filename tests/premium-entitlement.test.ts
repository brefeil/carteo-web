import test from "node:test";
import assert from "node:assert/strict";
import { applePremiumDecision } from "../app/lib/applePremiumDecision";
import { isPremiumAtRequest } from "../app/lib/premiumAtRequest";

const subscriptionIds = ["carteo.premium.monthly", "carteo.premium.yearly"];
const lifetimeIds = ["carteo.premium.lifetime"];
const now = Date.parse("2026-10-13T12:00:00.000Z");
const base = { transactionId: "200000000000001", productId: subscriptionIds[0], environment: "Production" as const };

test("Apple active subscription grants Premium", () => {
  assert.deepEqual(applePremiumDecision({ ...base, expiresDate: now + 1000 }, subscriptionIds, lifetimeIds, "Production", now), { status: "active", expiresAt: new Date(now + 1000).toISOString(), lifetime: false });
});
test("Apple expired subscription revokes Premium without an app launch", () => {
  assert.equal(applePremiumDecision({ ...base, expiresDate: now - 1 }, subscriptionIds, lifetimeIds, "Production", now).status, "expired");
});
test("Apple refund overrides otherwise active subscription", () => {
  assert.equal(applePremiumDecision({ ...base, expiresDate: now + 100000, revocationDate: now - 1 }, subscriptionIds, lifetimeIds, "Production", now).status, "revoked");
});
test("Apple lifetime is permanent unless refunded", () => {
  assert.equal(applePremiumDecision({ ...base, productId: lifetimeIds[0] }, subscriptionIds, lifetimeIds, "Production", now).lifetime, true);
  assert.equal(applePremiumDecision({ ...base, productId: lifetimeIds[0], revocationDate: now }, subscriptionIds, lifetimeIds, "Production", now).status, "revoked");
});
test("Apple rejects wrong store environment and unknown product", () => {
  assert.throws(() => applePremiumDecision({ ...base, environment: "Sandbox" }, subscriptionIds, lifetimeIds, "Production", now));
  assert.throws(() => applePremiumDecision({ ...base, productId: "fake.product" }, subscriptionIds, lifetimeIds, "Production", now));
});
test("Cloud only displays verified, unexpired Premium", () => {
  const active = { source: "apple", verificationStatus: "verified", status: "active", expiresAt: new Date(now + 1000).toISOString() };
  assert.equal(isPremiumAtRequest({ premiumEntitlement: active }, now), true);
  assert.equal(isPremiumAtRequest({ premiumEntitlement: active }, now + 1001), false);
  assert.equal(isPremiumAtRequest({ isPremium: true }, now), false);
  assert.equal(isPremiumAtRequest({ premiumEntitlement: { ...active, verificationStatus: "pending" } }, now), false);
  assert.equal(isPremiumAtRequest({ premiumEntitlement: { ...active, status: "revoked" } }, now), false);
});
