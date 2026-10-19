import { getProfileBySlug } from "../../lib/firestoreServer";
import { socialProfileUrl } from "../../lib/socialProfileUrl";
import { isPremiumAtRequest } from "../../lib/premiumAtRequest";

function escapeVCard(value: unknown): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

// Fold long vCard lines at 75 UTF-8 octets; continuation lines start with a space.
function foldLine(line: string): string {
  const pieces: string[] = [];
  let part = "";
  let length = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char, "utf8");
    if (length + bytes > (pieces.length ? 74 : 75)) {
      pieces.push(part);
      part = " " + char;
      length = 1 + bytes;
    } else {
      part += char;
      length += bytes;
    }
  }
  pieces.push(part);
  return pieces.join("\r\n");
}

async function photoProperty(avatar: unknown): Promise<string | null> {
  if (typeof avatar !== "string" || !avatar.trim()) return null;
  let url: URL;
  try {
    url = new URL(avatar);
  } catch {
    return null;
  }
  // Restrict server-side fetching to the app's Firebase Storage origin (SSRF protection).
  if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com" ||
      !url.pathname.startsWith("/v0/b/carteo-d0fa9.appspot.com/o/") &&
      !url.pathname.startsWith("/v0/b/carteo-d0fa9.firebasestorage.app/o/")) return null;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    const format = type === "image/jpeg" ? "JPEG" : type === "image/png" ? "PNG" : null;
    if (!format) return null;
    const advertisedSize = Number(response.headers.get("content-length") || 0);
    if (advertisedSize > 2_000_000) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return "PHOTO;ENCODING=b;TYPE=" + format + ":" + Buffer.concat(chunks).toString("base64");
  } catch {
    // An inaccessible photo must not prevent the contact from being downloaded.
    return null;
  }
}

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) return new Response("Slug manquant", { status: 400 });

  const profile = await getProfileBySlug(slug);
  if (!profile) return new Response("Profil introuvable", { status: 404 });
  if (profile.isActive === false) return new Response("Carte inactive", { status: 404 });

  // Match the public card's trusted Premium decision and social selection.
  const platforms = ["instagram", "snapchat", "tiktok", "facebook", "youtube", "linkedin"] as const;
  const socialLinks = platforms
    .map(platform => ({ platform, url: socialProfileUrl(platform, profile[platform]) }))
    .filter((entry): entry is { platform: typeof platforms[number]; url: string } => entry.url !== null);
  const selected = socialLinks.find(entry => entry.platform === profile.selectedSocialNetwork);
  const visibleUrls = (isPremiumAtRequest(profile)
    ? socialLinks
    : selected ? [selected] : socialLinks.slice(0, 1)).map(entry => entry.url);

  let givenName = String(profile.firstName ?? "").trim();
  let familyName = String(profile.lastName ?? "").trim();
  const displayName = String(profile.name ?? [givenName, familyName].filter(Boolean).join(" ")).trim();
  if (!givenName && !familyName && displayName.includes(" ")) {
    const parts = displayName.split(/\s+/);
    // Existing Cartéo cards can store names as "BREFEIL Nicolas".
    if (parts[0] === parts[0].toLocaleUpperCase("fr") && parts[0] !== parts[0].toLocaleLowerCase("fr")) {
      familyName = parts.shift()!;
      givenName = parts.join(" ");
    } else {
      familyName = parts.pop()!;
      givenName = parts.join(" ");
    }
  }
  const structuredName = [familyName || displayName, givenName, "", "", ""].map(escapeVCard).join(";");
  const photo = await photoProperty(profile.avatar);

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:" + escapeVCard(displayName),
    "N:" + structuredName,
    "ORG:" + escapeVCard(profile.company),
    "TITLE:" + escapeVCard(profile.title),
    "TEL:" + escapeVCard(profile.phone),
    "EMAIL:" + escapeVCard(profile.email),
    ...(profile.website ? ["URL:" + escapeVCard(profile.website)] : []),
    ...visibleUrls.map(url => "URL:" + escapeVCard(url)),
    ...(photo ? [photo] : []),
    "NOTE:" + escapeVCard(profile.bio),
    "END:VCARD",
  ];
  return new Response(lines.map(foldLine).join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": 'attachment; filename="' + encodeURIComponent(slug) + '.vcf"',
      "Cache-Control": "no-store",
    },
  });
}
