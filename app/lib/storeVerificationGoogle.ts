import { createSign } from "node:crypto";

function googleJwt(): string {
  const email = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PLAY_PRIVATE_KEY;
  if (!email || !key) throw new Error("google-play-credentials-missing");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({
    iss: email, scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(header + "." + body);
  signer.end();
  return header + "." + body + "." + signer.sign(key.replace(/\\n/g, "\n")).toString("base64url");
}

async function googleAccessToken(): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: googleJwt() }),
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("google-oauth-" + response.status);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("google-access-token-missing");
  return data.access_token;
}

/** Server-to-server check: never trust productId, expiry or Premium status from Android. */
export async function verifyGoogleSubscription(purchaseToken: string) {
  if (!purchaseToken || purchaseToken.length > 4096 || /\s/.test(purchaseToken)) throw new Error("google-purchase-token-invalid");
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!packageName || !/^[a-zA-Z0-9_.]+$/.test(packageName)) throw new Error("google-package-not-configured");
  const token = await googleAccessToken();
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { Authorization: "Bearer " + token }, cache: "no-store", signal: AbortSignal.timeout(10000) },
  );
  if (!response.ok) throw new Error("google-play-api-" + response.status);
  const data = await response.json() as {
    subscriptionState?: string;
    lineItems?: Array<{ productId?: string; expiryTime?: string }>;
    acknowledgementState?: string;
    externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  };
  const allowed = (process.env.GOOGLE_PREMIUM_PRODUCT_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
  const items = (data.lineItems || []).filter(x => allowed.includes(x.productId || ""));
  if (!items.length) throw new Error("google-product-not-premium");
  const expiry = Math.max(...items.map(x => Date.parse(x.expiryTime || "")));
  if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error("google-subscription-expired");
  if (!["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_CANCELED", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"].includes(data.subscriptionState || "")) throw new Error("google-subscription-inactive");
  return {
    store: "google" as const, productId: items[0].productId!, purchaseToken,
    expiresAt: new Date(expiry).toISOString(), productType: "subscription" as const,
    accountBinding: data.externalAccountIdentifiers?.obfuscatedExternalAccountId || null,
  };
}
