/**
 * Public display decision. Only server-verified, non-expired entitlements count.
 * A separate trusted backend must verify App Store / Play purchases and write
 * this projection; NEVER let the mobile app write it directly.
 * This function alone does NOT contact Apple or Google.
 */
type Profile = Record<string, unknown>;
function expiryMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  if (typeof value === "string") { const d = Date.parse(value); return Number.isFinite(d) ? d : null; }
  return null;
}
export function isPremiumAtRequest(profile: Profile, now = Date.now()): boolean {
  const entitlement = profile.premiumEntitlement;
  if (!entitlement || typeof entitlement !== "object" || Array.isArray(entitlement)) return false;
  const verified = entitlement as Record<string, unknown>;
  if (verified.verificationStatus !== "verified") return false;
  if (!["apple", "google", "admin"].includes(String(verified.source))) return false;
  if (verified.status !== "active" && verified.status !== "grace") return false;
  if (verified.lifetime === true && verified.status === "active") return true;
  const expiry = expiryMillis(verified.expiresAt);
  return expiry !== null && expiry > now;
}
