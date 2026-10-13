import { AppStoreServerAPIClient, Environment, SignedDataVerifier } from "@apple/app-store-server-library";

/** Apple official server library integration. This module must only run on the server. */
function required(key: string): string { const value = process.env[key]; if (!value) throw new Error("Missing " + key); return value; }
function env(value: "Production" | "Sandbox"): Environment { return value === "Production" ? Environment.PRODUCTION : Environment.SANDBOX; }
export function appleServerClient(environment: "Production" | "Sandbox"): AppStoreServerAPIClient {
  return new AppStoreServerAPIClient(required("APPLE_APP_STORE_PRIVATE_KEY").replace(/\\n/g, "\n"), required("APPLE_APP_STORE_KEY_ID"), required("APPLE_APP_STORE_ISSUER_ID"), required("APPLE_APP_BUNDLE_ID"), env(environment));
}
export function appleSignedDataVerifier(environment: "Production" | "Sandbox"): SignedDataVerifier {
  const roots = required("APPLE_ROOT_CA_DER_BASE64").split(",").map(s => Buffer.from(s.trim(), "base64"));
  if (!roots.length || roots.some(r => !r.length)) throw new Error("Missing Apple trust roots");
  const appleId = environment === "Production" ? Number(required("APPLE_APP_ID")) : undefined;
  if (environment === "Production" && (!Number.isSafeInteger(appleId) || !appleId)) throw new Error("Invalid APPLE_APP_ID");
  return new SignedDataVerifier(roots, true, env(environment), required("APPLE_APP_BUNDLE_ID"), appleId);
}
/** Fetch from Apple, then verify Apple's signed transaction before returning any claims. */
export async function verifiedAppleTransaction(transactionId: string, environment: "Production" | "Sandbox") {
  if (!/^\d{6,30}$/.test(transactionId)) throw new Error("Invalid transaction ID");
  const result = await appleServerClient(environment).getTransactionInfo(transactionId);
  if (!result.signedTransactionInfo) throw new Error("Apple returned no signed transaction");
  return appleSignedDataVerifier(environment).verifyAndDecodeTransaction(result.signedTransactionInfo);
}
/** For App Store Server Notifications V2. The caller must separately process and persist the event. */
export async function verifiedAppleNotification(signedPayload: string, environment: "Production" | "Sandbox") {
  return appleSignedDataVerifier(environment).verifyAndDecodeNotification(signedPayload);
}
