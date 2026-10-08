import { notFound } from "next/navigation";
import { getPublicProfileBySlug } from "../../lib/firestoreServer";
import {
  FaInstagram,
  FaTiktok,
  FaSnapchatGhost,
  FaFacebook,
  FaLinkedin,
  FaYoutube
} from "react-icons/fa"


export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const profile = await getPublicProfileBySlug(slug);

  // Do not leak card details in metadata when the public card is unavailable.
  if (!profile || profile.isActive === false) {
    return {
      title: "Cartéo",
      description: "Carte de visite numérique",
      robots: { index: false, follow: false },
    };
  }


  return {
    title: `${profile.name} | Cartéo`,
    description: profile.title || "Carte de visite numérique",
    openGraph: {
      title: `${profile.name} | Cartéo`,
      description: profile.title || "Carte de visite numérique",
      images: [`https://carteo.cloud/api/og/${slug}`],
    },
    twitter: {
      card: "summary_large_image",
      title: `${profile.name} | Cartéo`,
      description: profile.title || "Carte de visite numérique",
      images: [`https://carteo.cloud/api/og/${slug}`],
    },
  };
}

const linkStyle = {
  color: "white",
  textDecoration: "none",
  background: "#1C1C1E",
  padding: "12px 18px",
  borderRadius: "14px",
  width: "280px",
  textAlign: "center" as const,
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(12px)",
display: "flex",
alignItems: "center",
justifyContent: "center",
gap: "12px",
};

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const profile = await getPublicProfileBySlug(slug);

  if (!profile) {
    return <div style={{ color: "white", padding: 40 }}>Profil introuvable</div>;
  }

  const isActive = profile.isActive !== false;
  const isPremium = profile.isPremium === true;
 

const socialLinks = [
  { title: "Instagram", value: profile.instagram, icon: <FaInstagram /> },
  { title: "Snapchat", value: profile.snapchat, icon: <FaSnapchatGhost /> },
  { title: "TikTok", value: profile.tiktok, icon: <FaTiktok /> },
  { title: "Facebook", value: profile.facebook, icon: <FaFacebook /> },
  { title: "YouTube", value: profile.youtube, icon: <FaYoutube /> },
].filter((item) => item.value);

const visibleSocialLinks = isPremium ? socialLinks : socialLinks.slice(0, 1);

if (!isActive) {
  // Never expose why a public card was disabled (billing, owner choice, etc.).
  // Use the same neutral 404 presentation for every inactive card.
  notFound();
}

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
      {profile.avatar && (
        <img
          src={profile.avatar}
          alt="Photo de profil"
          width={170}
          height={170}
          style={{
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
      )}

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
      {profile.linkedin && (
  <a href={profile.linkedin} target="_blank" style={linkStyle}>
    <FaLinkedin size={24}/> LinkedIn
  </a>
)}

{visibleSocialLinks.map((item) => (
  <a
    key={item.title}
    href={item.value}
    target="_blank"
    style={linkStyle}
  >
    {item.icon}
    {item.title}
  </a>
))}

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