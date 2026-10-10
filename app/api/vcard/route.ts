import { getProfileBySlug } from "../../lib/firestoreServer";
import { socialProfileUrl } from "../../lib/socialProfileUrl";

function escapeVCard(value: unknown): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  if (!slug) return new Response("Slug manquant", { status: 400 });

  const profile = await getProfileBySlug(slug);
  if (!profile) return new Response("Profil introuvable", { status: 404 });

  const socials = ["instagram", "tiktok", "snapchat", "facebook", "linkedin", "youtube", "x"] as const;
  // Standard URL properties survive import into many contacts apps. Some contacts
  // apps show them as generic website links rather than named social profiles.
  const urls = socials
    .map(platform => socialProfileUrl(platform, profile[platform]))
    .filter((url): url is string => url !== null)
    .map(url => "URL:" + escapeVCard(url));

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:" + escapeVCard(profile.name),
    "ORG:" + escapeVCard(profile.company),
    "TITLE:" + escapeVCard(profile.title),
    "TEL:" + escapeVCard(profile.phone),
    "EMAIL:" + escapeVCard(profile.email),
    ...(profile.website ? ["URL:" + escapeVCard(profile.website)] : []),
    ...urls,
    "NOTE:" + escapeVCard(profile.bio),
    "END:VCARD",
  ];
  const vcard = lines.join("\r\n") + "\r\n";

  return new Response(vcard, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(slug)}.vcf"`,
    },
  });
}
