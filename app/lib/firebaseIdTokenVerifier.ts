import { createPublicKey, verify, X509Certificate } from "node:crypto";

/**
 * Verify Firebase Authentication ID tokens on the server before resolving
 * purchase ownership. This is NOT a purchase verification endpoint.
 *
 * Uses Google's published Firebase Secure Token signing certificates.
 * Never trust a UID provided separately by the client.
 */
const CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const MAX_TOKEN_LENGTH = 8192;

type FirebaseClaims = {
  aud?: unknown;
  iss?: unknown;
  sub?: unknown;
  exp?: unknown;
  iat?: unknown;
  auth_time?: unknown;
  firebase?: { sign_in_provider?: unknown };
};

function parseSegment<T>(part: string): T {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error("firebase-token-malformed");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
}

export async function verifyFirebaseIdToken(
  idToken: string,
  now = new Date(),
): Promise<{ uid: string; issuedAt: number; expiresAt: number }> {
  const projectId = process.env.FIREBASE_PROJECT_ID || "carteo-d0fa9";
  if (!/^[a-z0-9-]+$/.test(projectId)) throw new Error("firebase-project-config");
  if (!idToken || idToken.length > MAX_TOKEN_LENGTH) throw new Error("firebase-token-length");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("firebase-token-malformed");
  const [headerPart, claimsPart, signaturePart] = parts;
  const header = parseSegment<{ alg?: unknown; kid?: unknown; typ?: unknown }>(headerPart);
  const claims = parseSegment<FirebaseClaims>(claimsPart);
  if (header.alg !== "RS256" || typeof header.kid !== "string" ||
      !/^[A-Za-z0-9_-]{1,256}$/.test(header.kid) ||
      (header.typ !== undefined && header.typ !== "JWT")) {
    throw new Error("firebase-token-header");
  }
  const current = Math.floor(now.getTime() / 1000);
  if (claims.aud !== projectId ||
      claims.iss !== `https://securetoken.google.com/${projectId}` ||
      typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128 ||
      typeof claims.exp !== "number" || !Number.isSafeInteger(claims.exp) ||
      typeof claims.iat !== "number" || !Number.isSafeInteger(claims.iat) ||
      typeof claims.auth_time !== "number" || !Number.isSafeInteger(claims.auth_time) ||
      claims.exp <= current || claims.iat > current ||
      claims.auth_time > current || claims.iat > claims.exp) {
    throw new Error("firebase-token-claims");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(signaturePart)) throw new Error("firebase-token-signature");
  const response = await fetch(CERT_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`firebase-cert-http-${response.status}`);
  const certs = (await response.json()) as Record<string, unknown>;
  const pem = certs[header.kid];
  if (typeof pem !== "string" || !pem.includes("BEGIN CERTIFICATE")) {
    throw new Error("firebase-token-unknown-key");
  }
  const cert = new X509Certificate(pem);
  if (Date.parse(cert.validFrom) > now.getTime() ||
      Date.parse(cert.validTo) <= now.getTime()) {
    throw new Error("firebase-cert-expired");
  }
  const valid = verify(
    "RSA-SHA256",
    Buffer.from(`${headerPart}.${claimsPart}`),
    createPublicKey(cert.publicKey),
    Buffer.from(signaturePart, "base64url"),
  );
  if (!valid) throw new Error("firebase-token-invalid-signature");
  return { uid: claims.sub, issuedAt: claims.iat, expiresAt: claims.exp };
}
