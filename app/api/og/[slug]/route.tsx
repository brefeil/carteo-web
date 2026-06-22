import { ImageResponse } from "next/og";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const profileSnap = await getDoc(
    doc(db, "profiles", slug)
  );

  if (!profileSnap.exists()) {
    return new Response("Profil introuvable", { status: 404 });
  }

  const profile = profileSnap.data();

  return new ImageResponse(
  (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        background:
          "linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e3a8a 100%)",
        color: "white",
        padding: "60px",
        fontFamily: "Arial",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            fontSize: 24,
            color: "#38bdf8",
            marginBottom: 20,
          }}
        >
          {profile.company}
        </div>

        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
          }}
        >
          {profile.name}
        </div>

        <div
          style={{
            fontSize: 34,
            marginTop: 15,
            color: "#d1d5db",
          }}
        >
          {profile.title}
        </div>

        <div
          style={{
            fontSize: 24,
            marginTop: 40,
            color: "#94a3b8",
          }}
        >
          Carte de visite numérique
        </div>
      </div>

      <img
  src="https://carteo.cloud/carteo-logo.png?v=2"
  width={280}
  height={280}
  style={{
    borderRadius: 40,
    objectFit: "contain",
  }}
/>
    </div>
  ),
  {
    width: 1200,
    height: 630,
  }
);
}