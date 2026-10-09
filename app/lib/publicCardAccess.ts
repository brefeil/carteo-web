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

/**
 * Free public projection shared by Web, vCard, and newly generated Wallet
 * passes. This does not erase stored premium data: renewal restores it.
 * Keep the public QR URL and slug unchanged.
 *
 * Choose exactly one social link in a stable order until the owner can select
 * their preferred free social explicitly in a trusted profile field.
 */
export function projectFreePublicCard(profile: Record<string, any>): Record<string, any> {
  const socialFields = [
    "linkedin", "instagram", "tiktok", "snapchat", "facebook", "youtube",
  ] as const;
  const firstSocial = socialFields.find(
    (key) => typeof profile[key] === "string" && profile[key].trim() !== "",
  );
  const free = { ...profile };
  for (const key of socialFields) {
    if (key !== firstSocial) free[key] = "";
  }

  // Hide all Premium-only presentation/contact fields from public consumers.
  // Name, phone, email, slug and owner metadata are intentionally preserved.
  for (const key of [
    "title", "company", "website", "bio", "avatar",
    "walletAvatar", "walletAvatar2x", "walletAvatar3x",
  ]) {
    free[key] = "";
  }
  free.theme = "blue";
  free.isPremium = false;
  return free;
}
