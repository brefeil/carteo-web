import { X509Certificate, createPublicKey, verify } from "node:crypto";

/** Verify Apple-signed StoreKit transaction JWS against a pinned Apple root.
 * Configure APPLE_ROOT_CA_PEM with Apple's official App Store root certificate.
 * Never use decoded, unsigned JWS payloads to grant Premium.
 */
type AppleClaims = {
  bundleId?: string;
  environment?: "Production" | "Sandbox";
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  expiresDate?: number;
  revocationDate?: number;
  appAccountToken?: string;
  type?: string;
};
function parseJsonPart(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid-apple-jws");
  return parsed as Record<string, unknown>;
}
function validNow(cert: X509Certificate, now: number): boolean {
  return Date.parse(cert.validFrom) <= now && now <= Date.parse(cert.validTo);
}
export function verifyAppleTransactionJws(jws: string, expectedEnvironment: "Production" | "Sandbox", allowedProductIds: readonly string[], now = Date.now()): AppleClaims {
  const rootPem = process.env.APPLE_ROOT_CA_PEM;
  const bundleId = process.env.APPLE_APP_BUNDLE_ID;
  if (!rootPem || !bundleId) throw new Error("apple-verification-config-missing");
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("invalid-apple-jws");
  const header = parseJsonPart(parts[0]);
  if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length !== 3 || header.x5c.some(x => typeof x !== "string")) throw new Error("invalid-apple-jws-header");
  const [leaf, intermediate, suppliedRoot] = (header.x5c as string[]).map(c => new X509Certificate(Buffer.from(c, "base64")));
  const trustedRoot = new X509Certificate(rootPem.replace(/\\n/g, "\n"));
  if (suppliedRoot.fingerprint256 !== trustedRoot.fingerprint256) throw new Error("untrusted-apple-root");
  if (![leaf, intermediate, suppliedRoot].every(c => validNow(c, now))) throw new Error("expired-apple-certificate");
  if (!leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey)) throw new Error("invalid-apple-leaf-chain");
  if (!intermediate.checkIssued(trustedRoot) || !intermediate.verify(trustedRoot.publicKey)) throw new Error("invalid-apple-intermediate-chain");
  if (!trustedRoot.verify(trustedRoot.publicKey)) throw new Error("invalid-apple-root");
  if (leaf.ca || !intermediate.ca || !trustedRoot.ca) throw new Error("invalid-apple-cert-purpose");
  const ok = verify("sha256", Buffer.from(parts[0] + "." + parts[1]), { key: createPublicKey(leaf.publicKey), dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"));
  if (!ok) throw new Error("invalid-apple-jws-signature");
  const claims = parseJsonPart(parts[1]) as AppleClaims;
  if (claims.bundleId !== bundleId || claims.environment !== expectedEnvironment) throw new Error("apple-app-or-environment-mismatch");
  if (!claims.productId || !allowedProductIds.includes(claims.productId)) throw new Error("apple-product-not-allowed");
  if (!claims.transactionId || !/^\d{6,30}$/.test(claims.transactionId)) throw new Error("invalid-apple-transaction");
  return claims;
}
