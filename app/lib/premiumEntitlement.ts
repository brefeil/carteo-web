import { getFirestoreDocument } from "./firestoreServer";

/**
 * Read-only entitlement gate for public cards.
 * Entitlements must be written ONLY by a trusted backend after verifying
 * App Store Server API / Google Play Developer API purchases and webhooks.
 * The legacy profiles/{slug}.isPremium flag is intentionally ignored.
 */
export async function hasVerifiedPremium(profile: Record<string, unknown>): Promise<boolean> {
  const uid = typeof profile.ownerUID === "string" ? profile.ownerUID.trim() : "";
  if (!uid) return false;

  // A trusted server may write entitlements/{uid} after store verification.
  const entitlement = await getFirestoreDocument("entitlements", uid);
  if (!entitlement) return false;
  if (entitlement.status !== "active" || entitlement.verified !== true) return false;
  if (entitlement.store !== "apple" && entitlement.store !== "google") return false;
  if (entitlement.productType === "lifetime") return true;
  if (typeof entitlement.expiresAt !== "string") return false;
  const expiration = Date.parse(entitlement.expiresAt);
  return Number.isFinite(expiration) && expiration > Date.now();
}
