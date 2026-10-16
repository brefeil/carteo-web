/**
 * Shared server-side Premium decision for Cartéo Cloud.
 *
 * This is intentionally NOT wired into production routes until the trusted
 * Apple/Google purchase verification and legacy migration are tested.
 * Never accept an entitlement document written by an untrusted client.
 */
export type Entitlement = {
  status?: unknown;
  verified?: unknown;
  source?: unknown;
  productType?: unknown;
  expiresAt?: unknown;
};

export function verifiedPremium(entitlement: Entitlement | null, now = Date.now()): boolean | null {
  if (!entitlement) return null; // Not migrated yet; do not revoke legacy rights.
  if (entitlement.verified !== true) return null; // Incomplete migration.
  if (entitlement.status !== "active") return false;
  if (!["apple", "google", "admin_grant"].includes(String(entitlement.source))) return false;
  if (entitlement.productType === "lifetime") return true;
  if (typeof entitlement.expiresAt !== "string") return false;
  const expiry = Date.parse(entitlement.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

/**
 * Explicit migration marker, written by trusted backend after reconciliation.
 * A missing marker keeps the pre-migration presentation unchanged.
 * Once migrated, even an expired entitlement must override stale isPremium.
 */
export function cardPremiumStatus(
  profile: Record<string, unknown>,
  entitlement: Entitlement | null,
  now = Date.now(),
): boolean {
  if (profile.entitlementMigrationVersion !== 1) return profile.isPremium === true;
  return verifiedPremium(entitlement, now) === true;
}
