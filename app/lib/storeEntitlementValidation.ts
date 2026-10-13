/**
 * Shared input validation for server-side subscription verification.
 * This does not itself verify purchases: Apple/Google API validation is mandatory.
 */
export type Store = "apple" | "google";
export type VerifiedStoreEntitlement = {
  source: Store;
  verificationStatus: "verified";
  status: "active" | "grace" | "expired" | "revoked";
  expiresAt: string | null;
  lifetime: boolean;
  lastVerifiedAt: string;
  productId: string;
};

export function parseStore(value: unknown): Store | null {
  return value === "apple" || value === "google" ? value : null;
}

export function requireVerifiedStoreResult(value: {
  source: Store;
  verifiedByStore: boolean;
  productId: string;
  allowedProductIds: readonly string[];
  expiresAt?: string | null;
  lifetime?: boolean;
  revoked?: boolean;
  inGracePeriod?: boolean;
  environment: "Production" | "Sandbox";
  expectedEnvironment: "Production" | "Sandbox";
}): VerifiedStoreEntitlement {
  if (!value.verifiedByStore) throw new Error("store-not-verified");
  if (value.environment !== value.expectedEnvironment) throw new Error("wrong-store-environment");
  if (!value.allowedProductIds.includes(value.productId)) throw new Error("unknown-product");
  const expiry = value.expiresAt ? Date.parse(value.expiresAt) : NaN;
  if (!value.lifetime && !Number.isFinite(expiry)) throw new Error("missing-expiry");
  const now = Date.now();
  const status = value.revoked ? "revoked" : value.lifetime || expiry > now
    ? (value.inGracePeriod ? "grace" : "active") : "expired";
  return {
    source: value.source,
    verificationStatus: "verified",
    status,
    expiresAt: value.expiresAt ?? null,
    lifetime: Boolean(value.lifetime),
    lastVerifiedAt: new Date(now).toISOString(),
    productId: value.productId,
  };
}
