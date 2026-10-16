/**
 * Premium gifts policy. Server-side only: do not import from client components.
 * A grant is NOT proof of entitlement until loaded from trusted server storage.
 */
export type GiftReason = "influencer" | "family" | "commercial";
export type GiftDurationMonths = 1 | 3 | 6 | 12;
export type GiftDuration = GiftDurationMonths | "lifetime";
export type GiftStatus = "active" | "revoked";

export interface PremiumGift {
  uid: string;
  reason: GiftReason;
  duration: GiftDuration;
  startsAt: Date;
  expiresAt: Date | null;
  status: GiftStatus;
  grantedBy: string;
}

export function addUtcMonths(start: Date, months: GiftDurationMonths): Date {
  if (!Number.isFinite(start.getTime())) throw new Error("Invalid start date");
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + months;
  const day = start.getUTCDate();
  const first = new Date(Date.UTC(year, month, 1, start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first;
}

export function buildPremiumGift(input: {
  uid: string;
  reason: GiftReason;
  duration: GiftDuration;
  grantedBy: string;
  now: Date;
}): PremiumGift {
  if (!input.uid.trim() || !input.grantedBy.trim()) throw new Error("Missing identity");
  if (!["influencer", "family", "commercial"].includes(input.reason)) throw new Error("Invalid reason");
  if (![1, 3, 6, 12, "lifetime"].includes(input.duration)) throw new Error("Invalid duration");
  if (!Number.isFinite(input.now.getTime())) throw new Error("Invalid date");
  return {
    uid: input.uid,
    reason: input.reason,
    duration: input.duration,
    startsAt: new Date(input.now.getTime()),
    expiresAt: input.duration === "lifetime" ? null : addUtcMonths(input.now, input.duration as GiftDurationMonths),
    status: "active",
    grantedBy: input.grantedBy,
  };
}

export function isGiftActive(grant: PremiumGift, now: Date): boolean {
  return grant.status === "active" &&
    Number.isFinite(now.getTime()) &&
    grant.startsAt.getTime() <= now.getTime() &&
    (grant.expiresAt === null || now.getTime() < grant.expiresAt.getTime());
}

/** Combine with verified Apple/Google subscription status on the server. */
export function hasPremiumEntitlement(
  verifiedStoreSubscriptionActive: boolean,
  trustedGrants: readonly PremiumGift[],
  now: Date,
): boolean {
  return verifiedStoreSubscriptionActive || trustedGrants.some(grant => isGiftActive(grant, now));
}
