import { createPrivateKey, createSign, createVerify, X509Certificate, createHash } from "node:crypto";

/** Verify Apple-signed transaction with a pinned Apple Root CA SHA-256 fingerprint. */
export function verifyAppleJws(jws: string): Record<string, unknown> {
  const [header64, payload64, signature64, extra] = jws.split(".");
  if (!header64 || !payload64 || !signature64 || extra) throw new Error("apple-jws-format");
  const header = JSON.parse(Buffer.from(header64, "base64url").toString("utf8"));
  if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length < 2) throw new Error("apple-jws-header");
  const chain = header.x5c.map((der: string) => new X509Certificate(Buffer.from(der, "base64")));
  const pinned = process.env.APPLE_ROOT_CA_SHA256?.replace(/:/g, "").toLowerCase();
  if (!pinned || !/^[a-f0-9]{64}$/.test(pinned)) throw new Error("apple-root-not-configured");
  const root = chain[chain.length - 1];
  const fingerprint = createHash("sha256").update(root.raw).digest("hex");
  if (fingerprint !== pinned || !root.verify(root.publicKey)) throw new Error("apple-root-untrusted");
  const now = Date.now();
  for (let i = 0; i < chain.length; i++) {
    if (now < Date.parse(chain[i].validFrom) || now > Date.parse(chain[i].validTo)) throw new Error("apple-certificate-expired");
    if (i < chain.length - 1 && (!chain[i].checkIssued(chain[i + 1]) || !chain[i].verify(chain[i + 1].publicKey))) throw new Error("apple-chain-invalid");
  }
  const verifier = createVerify("SHA256");
  verifier.update(header64 + "." + payload64);
  verifier.end();
  if (!verifier.verify({ key: chain[0].publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature64, "base64url"))) throw new Error("apple-signature-invalid");
  const payload = JSON.parse(Buffer.from(payload64, "base64url").toString("utf8")) as Record<string, unknown>;
  if (payload.bundleId !== process.env.APPLE_BUNDLE_ID) throw new Error("apple-bundle-mismatch");
  if (payload.environment !== process.env.APPLE_STORE_ENVIRONMENT) throw new Error("apple-environment-mismatch");
  return payload;
}

function appleApiToken(): string {
  const issuer = process.env.APPLE_ISSUER_ID, keyId = process.env.APPLE_KEY_ID, privateKey = process.env.APPLE_IAP_PRIVATE_KEY;
  if (!issuer || !keyId || !privateKey) throw new Error("apple-api-not-configured");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ iss: issuer, iat: now, exp: now + 300, aud: "appstoreconnect-v1", bid: process.env.APPLE_BUNDLE_ID })).toString("base64url");
  const signer = createSign("SHA256");
  signer.update(header + "." + body);
  signer.end();
  const signature = signer.sign({ key: createPrivateKey(privateKey.replace(/\\n/g, "\n")), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return header + "." + body + "." + signature;
}

export async function verifyApplePurchase(transactionId: string) {
  if (!/^\d{8,25}$/.test(transactionId)) throw new Error("apple-transaction-id-invalid");
  const environment = process.env.APPLE_STORE_ENVIRONMENT;
  if (environment !== "Production" && environment !== "Sandbox") throw new Error("apple-environment-not-configured");
  const host = environment === "Production" ? "api.storekit.itunes.apple.com" : "api.storekit-sandbox.itunes.apple.com";
  const response = await fetch(`https://${host}/inApps/v1/transactions/${transactionId}`, {
    headers: { Authorization: "Bearer " + appleApiToken() }, cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("apple-api-" + response.status);
  const data = await response.json() as { signedTransactionInfo?: string };
  if (!data.signedTransactionInfo) throw new Error("apple-transaction-missing");
  const transaction = verifyAppleJws(data.signedTransactionInfo);
  if (String(transaction.transactionId) !== transactionId) throw new Error("apple-transaction-mismatch");
  if (transaction.revocationDate) throw new Error("apple-transaction-revoked");
  const productId = String(transaction.productId || "");
  const allowed = (process.env.APPLE_PREMIUM_PRODUCT_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!allowed.includes(productId)) throw new Error("apple-product-not-premium");
  const expires = transaction.expiresDate ? Number(transaction.expiresDate) : null;
  const lifetime = transaction.type === "Non-Consumable";
  if (!lifetime && (!expires || expires <= Date.now())) throw new Error("apple-transaction-expired");
  return { store: "apple" as const, productId, transactionId, originalTransactionId: String(transaction.originalTransactionId || transactionId), expiresAt: lifetime ? null : new Date(expires!).toISOString(), productType: lifetime ? "lifetime" as const : "subscription" as const };
}
