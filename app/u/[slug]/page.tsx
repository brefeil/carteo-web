import { getProfileBySlug } from "../../lib/firestoreServer";
import { socialProfileUrl } from "../../lib/socialProfileUrl";
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

  const profile = await getProfileBySlug(slug);

  if (!profile) {
    return {
      title: "Cartéo",
      description: "Carte de visite numérique",
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

  const profile = await getProfileBySlug(slug);

  if (!profile) {
    return <div style={{ color: "white", padding: 40 }}>Profil introuvable</div>;
  }

  const isActive = profile.isActive !== false;
  const isPremium = profile.isPremium === true;
 

const socialLinks = [
  { title: "LinkedIn", value: socialProfileUrl("linkedin", profile.linkedin), icon: <FaLinkedin /> },
  { title: "Instagram", value: socialProfileUrl("instagram", profile.instagram), icon: <FaInstagram /> },
  { title: "Snapchat", value: socialProfileUrl("snapchat", profile.snapchat), icon: <FaSnapchatGhost /> },
  { title: "TikTok", value: socialProfileUrl("tiktok", profile.tiktok), icon: <FaTiktok /> },
  { title: "Facebook", value: socialProfileUrl("facebook", profile.facebook), icon: <FaFacebook /> },
  { title: "YouTube", value: socialProfileUrl("youtube", profile.youtube), icon: <FaYoutube /> },
  { title: "X", value: socialProfileUrl("x", profile.x), icon: <span aria-hidden="true">𝕏</span> },
].filter((item) => item.value !== null);

const visibleSocialLinks = isPremium ? socialLinks : socialLinks.slice(0, 1);

if (!isActive) {
  return (
    <div
      style={{
        color: "white",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0A0A0A 0%, #111827 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "32px",
      }}
    >
      <div>
        <h1>Carte inactive</h1>
        <p>Cette carte n’est actuellement plus disponible.</p>
      </div>
    </div>
  );
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
{visibleSocialLinks.map((item) => (
  <a
    key={item.title}
    href={item.value!}
    target="_blank"
    rel="noopener noreferrer"
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