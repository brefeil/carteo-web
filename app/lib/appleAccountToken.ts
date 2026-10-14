import { createHmac, timingSafeEqual } from "node:crypto";

/** Stable, pseudonymous StoreKit appAccountToken derived on the trusted server.
 * The authenticated app must request this token BEFORE starting StoreKit purchase.
 * Never send the HMAC secret to the iOS app.
 */
export function appleAccountTokenForUid(uid: string): string {
  const secret = process.env.APPLE_APP_ACCOUNT_TOKEN_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Missing strong APPLE_APP_ACCOUNT_TOKEN_SECRET");
  if (!uid || uid.length > 128) throw new Error("Invalid Firebase UID");
  const bytes = createHmac("sha256", secret).update("carteo:storekit:account:v1:").update(uid).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}
export function appleAccountTokenMatchesUid(token: string | undefined, uid: string): boolean {
  if (!token || !/^[0-9a-fA-F-]{36}$/.test(token)) return false;
  const actual = Buffer.from(token.toLowerCase());
  const expected = Buffer.from(appleAccountTokenForUid(uid));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
