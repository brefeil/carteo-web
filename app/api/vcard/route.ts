import { getPublicProfileBySlug } from "../../lib/firestoreServer";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return new Response("Slug manquant", { status: 400 });
  }

  const profile = await getPublicProfileBySlug(slug);

  // A disabled card must not remain downloadable through the public vCard URL.
  // Keep the reason for unavailability private.
  if (!profile || profile.isActive === false) {
    return new Response("Carte indisponible", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${profile.name ?? ""}
ORG:${profile.company ?? ""}
TITLE:${profile.title ?? ""}
TEL:${profile.phone ?? ""}
EMAIL:${profile.email ?? ""}
URL:${profile.website ?? ""}
NOTE:${profile.bio ?? ""}
END:VCARD`;

  return new Response(vcard, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.vcf"`,
    },
  });
}