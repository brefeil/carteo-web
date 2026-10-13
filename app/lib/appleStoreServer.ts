import { createPrivateKey, sign } from "node:crypto";

/** Server-only App Store Server API client. Returned signed data MUST be verified. */
function token(): string {
  const issuer = process.env.APPLE_APP_STORE_ISSUER_ID;
  const keyId = process.env.APPLE_APP_STORE_KEY_ID;
  const bundleId = process.env.APPLE_APP_BUNDLE_ID;
  const privateKey = process.env.APPLE_APP_STORE_PRIVATE_KEY;
  if (!issuer || !keyId || !bundleId || !privateKey) throw new Error("Apple App Store credentials missing");
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = encode({ alg: "ES256", kid: keyId, typ: "JWT" }) + "." + encode({ iss: issuer, iat: now, exp: now + 300, aud: "appstoreconnect-v1", bid: bundleId });
  const signature = sign("sha256", Buffer.from(unsigned), { key: createPrivateKey(privateKey.replace(/\\n/g, "\n")), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return unsigned + "." + signature;
}
export type AppleTransactionResponse = { signedTransactionInfo?: string };
/** Raw signed transaction response; verify JWS signature and certificate chain before trusting claims. */
export async function getAppleTransaction(transactionId: string, environment: "Production" | "Sandbox"): Promise<AppleTransactionResponse> {
  if (!/^\\d{6,30}$/.test(transactionId)) throw new Error("invalid-apple-transaction-id");
  const base = environment === "Production" ? "https://api.storekit.itunes.apple.com" : "https://api.storekit-sandbox.itunes.apple.com";
  const response = await fetch(base + "/inApps/v1/transactions/" + encodeURIComponent(transactionId), { headers: { Authorization: "Bearer " + token() }, cache: "no-store" });
  if (!response.ok) throw new Error("apple-api-" + response.status);
  return response.json() as Promise<AppleTransactionResponse>;
}
