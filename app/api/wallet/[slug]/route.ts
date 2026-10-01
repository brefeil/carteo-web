import { doc, getDoc } from "firebase/firestore";
import forge from "node-forge";
import { PKPass } from "passkit-generator";
import sharp from "sharp";
import { db } from "../../../lib/firebase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ICON_1X = "iVBORw0KGgoAAAANSUhEUgAAAB0AAAAdCAYAAABWk2cPAAAAj0lEQVR42mPkFJD9z0BnwMQwAGDUUpoCFlI1SB6+iCH23FafJDMYiU292Cwj13KClhJjGamWM1HbQprEKTZfIDuOmCBmokaCgYkTG6dM1IonUlIwEzG+JDVLjJZIo5ZiTTjULiSI9ikhi0lxGBO5JQ82cWItxlvgkxusFBX41C4UBnd9OqAth9ESadRSfAAAyXY5/iLBui0AAAAASUVORK5CYII=";
const ICON_2X = "iVBORw0KGgoAAAANSUhEUgAAADoAAAA6CAYAAADhu0ooAAABGUlEQVR42u3ZuRHCMBAFUHtHCRmpA2qgAqp3Ba6CMiDVMAPIy98Lf6VgS09aa3XMp/PlMR2gyHSQQiihhBJKKKGE6kvzqGRZt4+/329X8zbMVkvAbzhvNByqBVqDYVAU0AosmZHId0tmJLIOyY4Mz6OeSMR32ryQ7xrrlWNb9Ej0/3lFI1OMWI2mppH9M+g82rJ9U1YrI0GPpse6NXz3khXJ/Wj1xYHpiGYOW4YuoYQS+n/Q7OlnGJo9fTB0LaCZw3cXdCR8s2JNQvcX7LJuJp21Gzo6KWka2z+DxqpO6isejqmvJKodd0pk5Z6dKtE9XWbW9cCGhq4XNnwysp6k0l4Eo8BlrvYjc2U4lNs0QgkllFBCCSW0RHkCB/Bt2CtoxggAAAAASUVORK5CYII=";
const ICON_3X = "iVBORw0KGgoAAAANSUhEUgAAAFcAAABXCAYAAABxyNlsAAABsklEQVR42u3cMVLDMBCFYaJxQ0dLwRk4AafnBJyCY0CVGRpmHGu1+1bv3zqJlc/Pa8tRfHt+eft5opbUgABccClwwQWXAhdccClwwQWXAhdcuzpUB/b6+XX6td8f75Lf4aZyP/cRzC7Y5biRqGrIZbgrUVWQ03EzUauRhwtsxfaHC2zFOJa3BRXUijYxXGEzxjdcYdsn1xl2Ga56arMuyQ5l2DMIj24v81o39GohCvYKwJltZ08ijl0O1/t7/0OumAKHJXcmtSu++N/xVN1bGJ3TeuZzK++MhST3ampVb3K3T+7usCG4HWZiVsl1SK319HdLXJfUTuPSb4WS65Raei644FLgggsuBS644AaU24xuCtdtxiXfFpzSS8/dDdclvdO49F3BtuCQ3hDcq+ldDVy9A8tPaKsA7p9bCSy1EC+if2+5ViwyJbuscgz/wwnrcxfidrgSyAIenQevvvNtp78ZwKP7oacMvDS56sCrx5f2r3Wlk1zrE5pyijPHYbVWrP0kQrFN2DwpJBPZ9hk31dNmK9wZbJ4rZlj8+gsuuBS44IJLgQsuuBS44IJLgQuuX/0CbQ2o5DZirAMAAAAASUVORK5CYII=";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function derCertificateToPem(der: Buffer) {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString("binary")));
  return forge.pki.certificateToPem(forge.pki.certificateFromAsn1(asn1));
}

function extractSignerFromP12(p12Buffer: Buffer, password: string) {
  const p12Asn1 = forge.asn1.fromDer(
    forge.util.createBuffer(p12Buffer.toString("binary")),
  );
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[
    forge.pki.oids.certBag
  ] ?? [];
  const signerBag =
    certBags.find((bag) =>
      bag.cert?.subject.attributes.some(
        (attribute) =>
          attribute.shortName === "CN" &&
          String(attribute.value).includes("Pass Type ID"),
      ),
    ) ?? certBags[0];

  const shroudedKeyBags = p12.getBags({
    bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
  })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  const keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[
    forge.pki.oids.keyBag
  ] ?? [];
  const keyBag = shroudedKeyBags[0] ?? keyBags[0];

  if (!signerBag?.cert || !keyBag?.key) {
    throw new Error("The Wallet P12 does not contain a signer certificate and private key");
  }

  return {
    signerCert: forge.pki.certificateToPem(signerBag.cert),
    signerKey: forge.pki.privateKeyToPem(keyBag.key),
  };
}

function clean(value: unknown, maxLength = 120) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function displayURL(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

async function walletThumbnailAssets(value: unknown) {
  const avatar = clean(value, 1000);
  if (!avatar) return {};

  try {
    const url = new URL(avatar);
    const allowedHosts = new Set([
      "firebasestorage.googleapis.com",
      "storage.googleapis.com",
    ]);

    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) {
      console.warn("Wallet avatar skipped: unsupported host");
      return {};
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) return {};

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return {};

    const source = Buffer.from(await response.arrayBuffer());
    if (source.byteLength > 8 * 1024 * 1024) return {};

    const makeThumbnail = (size: number) =>
      sharp(source)
        .rotate()
        .resize(size, size, { fit: "cover", position: "centre" })
        .png()
        .toBuffer();

    const [oneX, twoX, threeX] = await Promise.all([
      makeThumbnail(90),
      makeThumbnail(180),
      makeThumbnail(270),
    ]);

    return {
      "thumbnail.png": oneX,
      "thumbnail@2x.png": twoX,
      "thumbnail@3x.png": threeX,
    };
  } catch (error) {
    console.warn("Wallet avatar could not be prepared", error);
    return {};
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = decodeURIComponent(rawSlug).trim();
    if (!slug || slug.includes("/")) {
      return new Response("Invalid profile", { status: 400 });
    }

    const profileSnap = await getDoc(doc(db, "profiles", slug));
    if (!profileSnap.exists()) {
      return new Response("Profile not found", { status: 404 });
    }

    const profile = profileSnap.data();
    if (profile.isActive === false) {
      return new Response("Profile inactive", { status: 410 });
    }

    const passTypeIdentifier = requiredEnv("APPLE_WALLET_PASS_TYPE_ID");
    const teamIdentifier = requiredEnv("APPLE_WALLET_TEAM_ID");
    const p12 = Buffer.from(requiredEnv("APPLE_WALLET_P12_BASE64"), "base64");
    const p12Password = requiredEnv("APPLE_WALLET_P12_PASSWORD");
    const wwdrDer = Buffer.from(requiredEnv("APPLE_WALLET_WWDR_BASE64"), "base64");

    const { signerCert, signerKey } = extractSignerFromP12(p12, p12Password);
    const wwdr = derCertificateToPem(wwdrDer);
    const thumbnailAssets = await walletThumbnailAssets(profile.avatar);

    const pass = new PKPass(
      {
        "icon.png": Buffer.from(ICON_1X, "base64"),
        "icon@2x.png": Buffer.from(ICON_2X, "base64"),
        "icon@3x.png": Buffer.from(ICON_3X, "base64"),
        ...thumbnailAssets,
      },
      { wwdr, signerCert, signerKey },
      {
        formatVersion: 1,
        passTypeIdentifier,
        teamIdentifier,
        serialNumber: slug,
        organizationName: "Cartéo",
        description: "Carte de visite numérique Cartéo",
        logoText: "Cartéo",
        backgroundColor: "rgb(9, 16, 29)",
        foregroundColor: "rgb(255, 255, 255)",
        labelColor: "rgb(165, 243, 252)",
      },
    );

    pass.type = "generic";

    const name = clean(profile.name, 80) || "Carte Cartéo";
    const title = clean(profile.title, 100);
    const company = clean(profile.company, 100);
    const phone = clean(profile.phone, 40);
    const email = clean(profile.email, 120);
    const website = clean(profile.website, 300);
    const linkedin = clean(profile.linkedin, 300);
    const instagram = clean(profile.instagram, 300);
    const tiktok = clean(profile.tiktok, 300);
    const snapchat = clean(profile.snapchat, 300);
    const facebook = clean(profile.facebook, 300);
    const youtube = clean(profile.youtube, 300);
    const bio = clean(profile.bio, 1000);
    const profileURL = `https://carteo.cloud/u/${encodeURIComponent(slug)}`;

    pass.primaryFields.push({
      key: "name",
      label: "CARTE",
      value: name,
    });

    if (title) {
      pass.secondaryFields.push({
        key: "title",
        label: "FONCTION",
        value: title,
      });
    }

    if (company) {
      pass.auxiliaryFields.push({
        key: "company",
        label: "ENTREPRISE",
        value: company,
      });
    }

    if (phone) {
      pass.backFields.push({
        key: "phone",
        label: "Téléphone",
        value: phone,
      });
    }

    if (email) {
      pass.backFields.push({
        key: "email",
        label: "E-MAIL",
        value: email,
      });
    }

    if (website) {
      pass.backFields.push({
        key: "website",
        label: "SITE WEB",
        value: website,
      });
    }

    if (linkedin) {
      pass.backFields.push({
        key: "linkedin",
        label: "LINKEDIN",
        value: displayURL(linkedin),
      });
    }

    if (instagram) {
      pass.backFields.push({
        key: "instagram",
        label: "INSTAGRAM",
        value: displayURL(instagram),
      });
    }

    if (tiktok) {
      pass.backFields.push({
        key: "tiktok",
        label: "TIKTOK",
        value: displayURL(tiktok),
      });
    }

    if (snapchat) {
      pass.backFields.push({
        key: "snapchat",
        label: "SNAPCHAT",
        value: displayURL(snapchat),
      });
    }

    if (facebook) {
      pass.backFields.push({
        key: "facebook",
        label: "FACEBOOK",
        value: displayURL(facebook),
      });
    }

    if (youtube) {
      pass.backFields.push({
        key: "youtube",
        label: "YOUTUBE",
        value: displayURL(youtube),
      });
    }

    if (bio) {
      pass.backFields.push({
        key: "bio",
        label: "À PROPOS",
        value: bio,
      });
    }

    pass.backFields.push({
      key: "profile",
      label: "CARTE CARTÉO",
      value: profileURL,
    });

    pass.setBarcodes({
      format: "PKBarcodeFormatQR",
      message: profileURL,
      messageEncoding: "iso-8859-1",
      altText: "Ouvrir la carte Cartéo",
    });

    const buffer = pass.getAsBuffer();

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="carteo-${slug.replace(/[^a-zA-Z0-9_-]/g, "-")}.pkpass"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Wallet pass generation failed", error);
    return new Response("Unable to generate Wallet pass", { status: 500 });
  }
}
