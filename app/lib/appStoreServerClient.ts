import { createPrivateKey, sign } from "node:crypto";

/**
 * Read-only App Store Server API transport.
 *
 * IMPORTANT: signedTransactionInfo is NOT verified here. Never decode its
 * claims or grant Premium until Apple's signed-data verification, expected
 * bundle ID, app ID, environment and account ownership checks are complete.
 */
export type AppStoreEnvironment = "Sandbox" | "Production";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing-config-${name}`);
  return value;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function appStoreToken(now = new Date()): string {
  const issuer = required("APP_STORE_ISSUER_ID");
  const keyId = required("APP_STORE_KEY_ID");
  const bundleId = required("APP_STORE_BUNDLE_ID");
  const rawKey = required("APP_STORE_PRIVATE_KEY");
  const privateKey = createPrivateKey(rawKey.replace(/\\n/g, "\n"));
  const seconds = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: issuer, iat: seconds, exp: seconds + 300,
    aud: "appstoreconnect-v1", bid: bundleId,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: privateKey, dsaEncoding: "ieee-p1363",
  });
  return `${unsigned}.${base64url(signature)}`;
}

export type UnverifiedAppStoreTransactionResponse = {
  signedTransactionInfo: string;
};

export async function fetchUnverifiedAppStoreTransaction(
  transactionId: string,
  environment: AppStoreEnvironment,
): Promise<UnverifiedAppStoreTransactionResponse> {
  if (!/^\\d{1,30}$/.test(transactionId)) throw new Error("invalid-apple-transaction-id");
  const base = environment === "Production"
    ? "https://api.storekit.itunes.apple.com"
    : "https://api.storekit-sandbox.itunes.apple.com";
  const response = await fetch(
    `${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
    { headers: { Authorization: `Bearer ${appStoreToken()}` }, cache: "no-store" },
  );
  if (!response.ok) throw new Error(`app-store-http-${response.status}`);
  const json: unknown = await response.json();
  if (!json || typeof json !== "object" ||
      typeof (json as { signedTransactionInfo?: unknown }).signedTransactionInfo !== "string") {
    throw new Error("app-store-invalid-response");
  }
  return json as UnverifiedAppStoreTransactionResponse;
}
