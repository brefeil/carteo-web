/** Server-side projection. The entitlement must be verified by a trusted backend. */
type Profile = Record<string, unknown>;
function expiryMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  if (typeof value === "string") { const d = Date.parse(value); return Number.isFinite(d) ? d : null; }
  return null;
}
export function isPremiumAtRequest(profile: Profile, now = Date.now()): boolean {
  const entitlement = profile.premiumEntitlement;
  if (entitlement && typeof entitlement === "object" && !Array.isArray(entitlement)) {
    const verified = entitlement as Record<string, unknown>;
    if (!["apple", "google", "admin"].includes(String(verified.source))) return false;
    if (verified.status !== "active" && verified.status !== "grace") return false;
    if (verified.lifetime === true && verified.status === "active") return true;
    const expiry = expiryMillis(verified.expiresAt);
    return expiry !== null && expiry > now;
  }
  // Migration fallback: existing isPremium values are NOT store-verified.
  // Remove after all existing customers have trusted entitlement records.
  return profile.isPremium === true;
}
