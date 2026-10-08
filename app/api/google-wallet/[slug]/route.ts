import { createSign } from "crypto";
import { getPublicProfileBySlug, normalizePrivateKey, serviceAccountEmail } from "../../../lib/firestoreServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function clean(value: unknown, maxLength = 120) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(payload: Record<string, unknown>, privateKey: string) {
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();

  const signature = signer.sign(privateKey);
  return `${unsigned}.${base64Url(signature)}`;
}


async function getWalletAccessToken(serviceEmail: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    {
      iss: serviceEmail,
      scope: "https://www.googleapis.com/auth/wallet_object.issuer",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    privateKey,
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = (await response.text()).slice(0, 200);
    throw new Error(`wallet-token-http-${response.status}-${text}`);
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("wallet-token-missing");
  return json.access_token;
}

async function ensureGenericObject(
  accessToken: string,
  genericObject: Record<string, unknown>,
) {
  const objectId = String(genericObject.id ?? "");
  const getUrl =
    `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(objectId)}`;

  const existing = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (existing.ok) return;

  if (existing.status !== 404) {
    const text = (await existing.text()).slice(0, 300);
    throw new Error(`wallet-object-get-${existing.status}-${text}`);
  }

  const created = await fetch(
    "https://walletobjects.googleapis.com/walletobjects/v1/genericObject",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(genericObject),
      cache: "no-store",
    },
  );

  if (!created.ok && created.status !== 409) {
    const text = (await created.text()).slice(0, 500);
    throw new Error(`wallet-object-create-${created.status}-${text}`);
  }
}

function colorForTheme(theme: string) {
  switch (theme) {
    case "mint":
      return "#1FBF9F";
    case "sunset":
      return "#E83E8C";
    case "gold":
      return "#D9A21B";
    case "dark":
      return "#161616";
    default:
      return "#0868F2";
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  let stage = "start";
  try {
    const { slug: rawSlug } = await params;
    const slug = decodeURIComponent(rawSlug).trim();

    if (!slug || slug.includes("/")) {
      return new Response("Invalid profile", { status: 400 });
    }

    stage = "profile-read";
    const profile = await getPublicProfileBySlug(slug);
    if (!profile) {
      return new Response("Profile not found", { status: 404 });
    }
    if (profile.isActive === false) {
      return new Response("Profile inactive", { status: 410 });
    }

    stage = "environment";
    const issuerId = requiredEnv("GOOGLE_WALLET_ISSUER_ID");
    const serviceEmail = serviceAccountEmail();
    const privateKey = normalizePrivateKey(requiredEnv("GOOGLE_WALLET_PRIVATE_KEY"));

    const profileURL = `https://carteo.cloud/u/${encodeURIComponent(slug)}`;
    const objectId = `${issuerId}.carteo_${slug.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
    const classId = `${issuerId}.carteo_generic`;

    const name = clean(profile.name, 80) || "Carte Cartéo";
    const title = clean(profile.title, 100);
    const company = clean(profile.company, 100);
    const phone = clean(profile.phone, 40);
    const email = clean(profile.email, 120);
    const website = clean(profile.website, 300);
    const theme = clean(profile.theme, 40) || "blue";
    const avatar = clean(profile.avatar, 1000);

    const textModulesData = [
      phone && { id: "phone", header: "Téléphone", body: phone },
      email && { id: "email", header: "E-mail", body: email },
      website && { id: "website", header: "Site web", body: website },
      company && { id: "company", header: "Entreprise", body: company },
    ].filter(Boolean);

    const genericObject: Record<string, unknown> = {
      id: objectId,
      classId,
      state: "ACTIVE",
      cardTitle: {
        defaultValue: {
          language: "fr-FR",
          value: "Cartéo",
        },
      },
      header: {
        defaultValue: {
          language: "fr-FR",
          value: name,
        },
      },
      subheader: {
        defaultValue: {
          language: "fr-FR",
          value: title || company || "Carte digitale",
        },
      },
      hexBackgroundColor: colorForTheme(theme),
      barcode: {
        type: "QR_CODE",
        value: profileURL,
        alternateText: "Ouvrir la carte Cartéo",
      },
      textModulesData,
      linksModuleData: {
        uris: [
          {
            uri: profileURL,
            description: "Voir ma carte Cartéo",
            id: "profile",
          },
          {
            uri: `https://carteo.cloud/api/vcard?slug=${encodeURIComponent(slug)}`,
            description: "Ajouter aux contacts",
            id: "vcard",
          },
        ],
      },
    };

    if (avatar.startsWith("https://")) {
      genericObject.logo = {
        sourceUri: { uri: avatar },
        contentDescription: {
          defaultValue: {
            language: "fr-FR",
            value: "Photo de profil",
          },
        },
      };
    }

    stage = "wallet-token";
    const walletAccessToken = await getWalletAccessToken(serviceEmail, privateKey);

    stage = "wallet-object";
    await ensureGenericObject(walletAccessToken, genericObject);

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceEmail,
      aud: "google",
      typ: "savetowallet",
      iat: now,
      origins: ["https://carteo.cloud"],
      payload: {
        genericObjects: [{ id: objectId, classId }],
      },
    };

    stage = "jwt-sign";
    const jwt = signJwt(payload, privateKey);
    stage = "redirect";
    const url = `https://pay.google.com/gp/v/save/${jwt}`;

    return Response.redirect(url, 302);
  } catch (error) {
    console.error("Google Wallet pass generation failed", { stage, error });
    const detail =
      error instanceof Error
        ? error.message.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60)
        : "unknown";
    return new Response(
      `Unable to generate Google Wallet pass [${stage}:${detail}]`,
      { status: 500 },
    );
  }
}
