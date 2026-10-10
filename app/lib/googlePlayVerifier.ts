import { createHash, createSign } from "node:crypto";

/**
 * Google Play purchase verification, read-only.
 *
 * Security requirements:
 * - Google Play API is the source of truth (never a client premium flag).
 * - Product ID is allowlisted; package name comes from server config.
 * - Purchase MUST carry a server-verifiable obfuscated account ID bound to
 *   the authenticated Firebase UID; legacy purchases without this binding
 *   require a separate trusted migration process.
 * - No Firestore entitlement is written by this module.
 */

const SUBSCRIPTIONS = new Set([
  "carteo_premium_monthly",
  "carteo_premium_yearly",
]);
const LIFETIME = "carteo_premium_lifetime_299";

export type GooglePlayVerifiedPurchase = {
  productType: "subscription" | "lifetime";
  expiresAt: string | null;
  orderId: string | null;
};

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing-config-${name}`);
  return value;
}

function googleServiceAccount(): { client_email: string; private_key: string } {
  const raw = JSON.parse(required("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")) as {
    client_email?: string;
    private_key?: string;
  };
  if (!raw.client_email || !raw.private_key) throw new Error("invalid-play-service-account");
  return { client_email: raw.client_email, private_key: raw.private_key };
}

async function playAccessToken(): Promise<string> {
  const account = googleServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const message = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  const assertion = `${message}.${base64url(signer.sign(account.private_key))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`play-oauth-http-${response.status}`);
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("play-oauth-missing-token");
  return body.access_token;
}

/**
 * Android BillingClient must set the obfuscated account ID to this digest
 * BEFORE purchase. UID is never sent in plaintext to Google Play.
 */
export function playObfuscatedAccountId(uid: string): string {
  return createHash("sha256").update(`carteo-play-account-v1:${uid}`).digest("hex");
}

function validateProductId(productId: string) {
  if (!SUBSCRIPTIONS.has(productId) && productId !== LIFETIME) {
    throw new Error("unknown-play-product");
  }
}

async function playGet(path: string): Promise<Record<string, unknown>> {
  const token = await playAccessToken();
  const response = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404 || response.status === 410) return {};
  if (!response.ok) throw new Error(`play-api-http-${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

export async function verifyGooglePlayPurchase(
  firebaseUID: string,
  productId: string,
  purchaseToken: string,
  now = new Date(),
): Promise<GooglePlayVerifiedPurchase | null> {
  if (!firebaseUID || firebaseUID.length > 128) throw new Error("invalid-uid");
  validateProductId(productId);
  if (!purchaseToken || purchaseToken.length > 4096) throw new Error("invalid-play-token");
  const packageName = required("GOOGLE_PLAY_PACKAGE_NAME");
  const pkg = encodeURIComponent(packageName);
  const token = encodeURIComponent(purchaseToken);
  const expectedAccount = playObfuscatedAccountId(firebaseUID);

  if (SUBSCRIPTIONS.has(productId)) {
    const data = await playGet(`applications/${pkg}/purchases/subscriptionsv2/tokens/${token}`);
    const external = data.externalAccountIdentifiers as
      | { obfuscatedExternalAccountId?: string }
      | undefined;
    if (external?.obfuscatedExternalAccountId !== expectedAccount) return null;
    if (data.subscriptionState !== "SUBSCRIPTION_STATE_ACTIVE" &&
        data.subscriptionState !== "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" &&
        data.subscriptionState !== "SUBSCRIPTION_STATE_CANCELED") return null;
    const items = Array.isArray(data.lineItems) ? data.lineItems as Array<Record<string, unknown>> : [];
    const validItem = items.find(item =>
      item.productId === productId &&
      typeof item.expiryTime === "string" &&
      Number.isFinite(Date.parse(item.expiryTime)) &&
      Date.parse(item.expiryTime) > now.getTime());
    if (!validItem) return null;
    return {
      productType: "subscription",
      expiresAt: validItem.expiryTime as string,
      orderId: typeof data.latestOrderId === "string" ? data.latestOrderId : null,
    };
  }

  const data = await playGet(
    `applications/${pkg}/purchases/products/${encodeURIComponent(productId)}/tokens/${token}`,
  );
  if (data.obfuscatedExternalAccountId !== expectedAccount) return null;
  // Google Play purchaseState 0 = purchased; 1 = canceled; 2 = pending.
  if (data.purchaseState !== 0) return null;
  return {
    productType: "lifetime",
    expiresAt: null,
    orderId: typeof data.orderId === "string" ? data.orderId : null,
  };
}
