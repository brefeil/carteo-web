import { createSign } from "node:crypto";

/** Server-only Google Play Developer API client. Never expose the service account. */
type ServiceAccount = { client_email: string; private_key: string };
function base64url(input: string | Buffer) { return Buffer.from(input).toString("base64url"); }
function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing");
  const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  if (!parsed.client_email || !parsed.private_key) throw new Error("invalid Google Play service account");
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}
async function accessToken(): Promise<string> {
  const account = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = header + "." + payload;
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end();
  const assertion = unsigned + "." + signer.sign(account.private_key.replace(/\\n/g, "\n")).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), cache: "no-store" });
  if (!response.ok) throw new Error("google-oauth-" + response.status);
  const json = await response.json() as { access_token?: string };
  if (!json.access_token) throw new Error("google-oauth-token-missing");
  return json.access_token;
}
export type GoogleSubscriptionV2 = {
  subscriptionState?: string;
  lineItems?: Array<{ productId?: string; expiryTime?: string }>;
  acknowledgementState?: string;
  linkedPurchaseToken?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
};
/** Query Google for a purchase token obtained from an authenticated app user. */
export async function getGoogleSubscription(purchaseToken: string): Promise<GoogleSubscriptionV2> {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!packageName) throw new Error("GOOGLE_PLAY_PACKAGE_NAME missing");
  if (!purchaseToken || purchaseToken.length > 4096) throw new Error("invalid-purchase-token");
  const token = await accessToken();
  const url = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" + encodeURIComponent(packageName) + "/purchases/subscriptionsv2/tokens/" + encodeURIComponent(purchaseToken);
  const response = await fetch(url, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
  if (!response.ok) throw new Error("google-play-" + response.status);
  return response.json() as Promise<GoogleSubscriptionV2>;
}
