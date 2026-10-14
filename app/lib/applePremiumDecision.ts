/** Convert already cryptographically verified Apple transaction claims to a Premium decision.
 * This module NEVER accepts a decoded but unverified transaction.
 * The caller must use Apple's SignedDataVerifier and validate the product allowlist.
 */
export type VerifiedApplePurchase = {
  productId: string;
  transactionId: string;
  originalTransactionId?: string;
  expiresDate?: number;
  revocationDate?: number;
  type?: string;
  environment: "Production" | "Sandbox";
};
export type ApplePremiumDecision = {
  status: "active" | "expired" | "revoked";
  expiresAt: string | null;
  lifetime: boolean;
};
export function applePremiumDecision(
  transaction: VerifiedApplePurchase,
  allowedSubscriptionIds: readonly string[],
  allowedLifetimeIds: readonly string[],
  expectedEnvironment: "Production" | "Sandbox",
  now = Date.now(),
): ApplePremiumDecision {
  if (transaction.environment !== expectedEnvironment) throw new Error("wrong-apple-environment");
  if (!transaction.transactionId) throw new Error("missing-apple-transaction");
  const subscription = allowedSubscriptionIds.includes(transaction.productId);
  const lifetime = allowedLifetimeIds.includes(transaction.productId);
  if (!subscription && !lifetime) throw new Error("unapproved-apple-product");
  if (transaction.revocationDate != null) return { status: "revoked", expiresAt: null, lifetime };
  if (lifetime) return { status: "active", expiresAt: null, lifetime: true };
  if (!Number.isFinite(transaction.expiresDate) || !transaction.expiresDate || transaction.expiresDate <= 0) throw new Error("missing-apple-expiration");
  return { status: transaction.expiresDate > now ? "active" : "expired", expiresAt: new Date(transaction.expiresDate).toISOString(), lifetime: false };
}
