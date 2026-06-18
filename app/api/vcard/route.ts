import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return new Response("Slug manquant", { status: 400 });
  }

  const profileSnap = await getDoc(doc(db, "profiles", slug));

  if (!profileSnap.exists()) {
    return new Response("Profil introuvable", { status: 404 });
  }

  const profile = profileSnap.data();

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