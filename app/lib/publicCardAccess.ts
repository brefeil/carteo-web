/**
 * Public card visibility policy for the future server-verified entitlement flow.
 *
 * Do NOT enable in production until:
 *  - a trusted Apple/Google purchase verifier writes premiumEntitlements/{uid};
 *  - Firestore rules deny ALL client writes to premiumEntitlements;
 *  - ownerUID and primary-card designation are securely migrated;
 *  - legacy iOS/Android versions have a safe compatibility plan.
 *
 * Never accept profile.isPremium or a client-supplied entitlement as proof.
 */
export type VerifiedEntitlement = {
  status: "active" | "inactive";
  productType: "subscription" | "lifetime";
  expiresAt?: string | null;
};

export type PublicCardDecision = {
  accessible: boolean;
  premiumFeatures: boolean;
};

export function decidePublicCardAccess(
  isPrimary: boolean,
  entitlement: VerifiedEntitlement | null,
  now: Date = new Date(),
): PublicCardDecision {
  const active =
    entitlement?.status === "active" &&
    (entitlement.productType === "lifetime" ||
      (entitlement.productType === "subscription" &&
        typeof entitlement.expiresAt === "string" &&
        Number.isFinite(Date.parse(entitlement.expiresAt)) &&
        Date.parse(entitlement.expiresAt) > now.getTime()));

  if (active) {
    return { accessible: true, premiumFeatures: true };
  }

  // Primary cards remain public with free features.
  // Secondary cards return the same generic unavailable response regardless
  // of the cause. Their existing slug / Wallet QR remains unchanged.
  return { accessible: isPrimary, premiumFeatures: false };
}
