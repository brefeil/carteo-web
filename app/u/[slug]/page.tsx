import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

const linkStyle = {
  color: "white",
  textDecoration: "none",
  background: "#1C1C1E",
  padding: "12px 18px",
  borderRadius: "14px",
  width: "260px",
  textAlign: "center" as const,
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(12px)",
};

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const profileSnap = await getDoc(doc(db, "profiles", slug));

  if (!profileSnap.exists()) {
    return <div style={{ color: "white", padding: 40 }}>Profil introuvable</div>;
  }

  const profile = profileSnap.data();

  return (
    <div
      style={{
        background:
        "linear-gradient(180deg, #0A0A0A 0%, #111827 100%)",
        color: "#fff",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "14px",
        padding: "32px",
      }}
    >
      <img
        src={profile.avatar}
        width={170}
        height={170}
        style={{
          borderRadius: "50%",
          objectFit: "cover",
        }}
      />

      <h1
  style={{
    fontSize: "32px",
    marginBottom: 0,
  }}
>
  {profile.name}
</h1>
      <p>{profile.title}</p>
      <p>{profile.company}</p>

      {profile.phone && <a href={`tel:${profile.phone}`} style={linkStyle}>📞 {profile.phone}</a>}
      {profile.email && <a href={`mailto:${profile.email}`} style={linkStyle}>✉️ {profile.email}</a>}
      {profile.website && <a href={profile.website} target="_blank" style={linkStyle}>🌐 Site web</a>}
      {profile.linkedin && <a href={profile.linkedin} target="_blank" style={linkStyle}>💼 LinkedIn</a>}
      {profile.instagram && <a href={profile.instagram} target="_blank" style={linkStyle}>📷 Instagram</a>}
      {profile.snapchat && <a href={profile.snapchat} target="_blank" style={linkStyle}>👻 Snapchat</a>}
      {profile.tiktok && <a href={profile.tiktok} target="_blank" style={linkStyle}>🎵 TikTok</a>}
      {profile.facebook && <a href={profile.facebook} target="_blank" style={linkStyle}>👍 Facebook</a>}
      {profile.youtube && <a href={profile.youtube} target="_blank" style={linkStyle}>▶️ YouTube</a>}

      {profile.bio && (
        <p style={{ maxWidth: "360px", textAlign: "center", opacity: 0.9 }}>
          {profile.bio}
        </p>
      )}

      <a
        href={`/api/vcard?slug=${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          background: "#0A84FF",
          color: "white",
          textDecoration: "none",
          padding: "14px 26px",
          borderRadius: "14px",
          marginTop: "8px",
        }}
      >
        Ajouter aux contacts
      </a>
    </div>
  );
}