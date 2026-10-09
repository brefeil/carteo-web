import { createSign } from "crypto";

const PROJECT_ID = "carteo-d0fa9";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function serviceAccountEmail() {
  const value =
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL ||
    process.env.GOOGLE_WALLET_ACCOUNT_EMAIL;
  if (!value) {
    throw new Error("Missing environment variable: GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL");
  }
  return value.trim();
}


export function normalizePrivateKey(raw: string) {
  let value = raw.trim();

  // If the whole service-account JSON was pasted, extract private_key.
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as { private_key?: string };
      if (parsed.private_key) value = parsed.private_key;
    } catch {
      // Keep the original value for the fallback parsing below.
    }
  }

  // Remove wrapping quotes and normalize escaped line breaks.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  value = value.replace(/\\+n/g, "\n").trim();

  // Accept a base64-encoded PEM too.
  if (!value.includes("BEGIN PRIVATE KEY")) {
    try {
      const decoded = Buffer.from(value, "base64").toString("utf8").trim();
      if (decoded.includes("BEGIN PRIVATE KEY")) value = decoded;
    } catch {
      // Ignore and continue to explicit validation.
    }
  }

  const begin = "-----BEGIN PRIVATE KEY-----";
  const end = "-----END PRIVATE KEY-----";
  const beginIndex = value.indexOf(begin);
  const endIndex = value.indexOf(end);

  if (beginIndex < 0 || endIndex < 0 || endIndex <= beginIndex) {
    throw new Error("private-key-format");
  }

  // Rebuild a canonical PEM even if Vercel received it on one line,
  // with escaped newlines, spaces, or extra JSON formatting.
  const body = value
    .slice(beginIndex + begin.length, endIndex)
    .replace(/[^A-Za-z0-9+/=]/g, "");

  if (!body) throw new Error("private-key-empty");

  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `${begin}\n${wrapped}\n${end}\n`;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(payload: Record<string, unknown>, privateKey: string) {
  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();

  const signature = signer.sign(privateKey);
  return `${unsigned}.${base64Url(signature)}`;
}

async function getAccessToken() {
  const clientEmail = serviceAccountEmail();
  const privateKey = normalizePrivateKey(requiredEnv("GOOGLE_WALLET_PRIVATE_KEY"));
  const now = Math.floor(Date.now() / 1000);

  const assertion = signJwt(
    {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    privateKey,
  );

  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
      cache: "no-store",
    });
  } catch {
    throw new Error("token-network");
  }

  if (!response.ok) {
    throw new Error(`token-http-${response.status}`);
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("token-missing");
  }

  return json.access_token;
}

function decodeValue(value: any): any {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    return (value.arrayValue?.values ?? []).map(decodeValue);
  }
  if ("mapValue" in value) {
    return decodeFields(value.mapValue?.fields ?? {});
  }
  return null;
}

function decodeFields(fields: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]),
  );
}

export async function getProfileBySlug(slug: string) {
  const safeSlug = slug.trim();
  if (!safeSlug || safeSlug.includes("/")) return null;

  const token = await getAccessToken();
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/profiles/${encodeURIComponent(safeSlug)}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`firestore-http-${response.status}`);
  }

  const document = (await response.json()) as {
    fields?: Record<string, any>;
  };

  return decodeFields(document.fields ?? {});
}

/**
 * Staged server-side public access path. Opt-in ONLY after trusted entitlement
 * verification and strict Firestore rules are deployed and tested.
 *
 * Current production remains on legacy behavior while this flag is unset.
 */
export async function getPublicProfileBySlug(slug: string) {
  const profile = await getProfileBySlug(slug);
  if (!profile) return null;

  if (process.env.SERVER_PREMIUM_ACCESS_ENABLED !== "true") {
    return profile;
  }

  // Fail closed: no trustworthy owner or primary designation -> no public card.
  const ownerUID = typeof profile.ownerUID === "string" ? profile.ownerUID : "";
  if (!ownerUID || profile.schemaVersion !== 2 ||
      typeof profile.isPrimary !== "boolean") {
    return null;
  }

  // Import lazily to keep the policy separate from legacy Firestore decoding.
  const { decidePublicCardAccess, projectFreePublicCard } = await import("./publicCardAccess");
  const token = await getAccessToken();
  const entitlementUrl =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/premiumEntitlements/${encodeURIComponent(ownerUID)}`;
  const response = await fetch(entitlementUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  // Missing entitlement means free tier; all other fetch errors fail closed.
  let entitlement = null;
  if (response.ok) {
    const document = (await response.json()) as { fields?: Record<string, any> };
    const data = decodeFields(document.fields ?? {});
    entitlement = {
      status: data.status === "active" ? "active" as const : "inactive" as const,
      productType: data.productType === "lifetime" ? "lifetime" as const : "subscription" as const,
      expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
    };
  } else if (response.status !== 404) {
    throw new Error(`premium-entitlement-http-${response.status}`);
  }

  const decision = decidePublicCardAccess(profile.isPrimary, entitlement);
  if (!decision.accessible) return null;

  // The public page must never trust the client-controlled isPremium field.
  return decision.premiumFeatures
    ? { ...profile, isPremium: true }
    : projectFreePublicCard(profile);
}
