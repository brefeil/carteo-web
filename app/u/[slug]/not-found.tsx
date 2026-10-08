import Link from "next/link";

export default function CardNotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0A0A0A 0%, #111827 100%)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: "28px", marginBottom: "14px" }}>
          Cette carte est temporairement indisponible
        </h1>
        <p style={{ color: "#C4CBD5", lineHeight: 1.6 }}>
          Impossible d’accéder à cette carte pour le moment.
          Veuillez réessayer ultérieurement.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            color: "#fff",
            textDecoration: "underline",
            marginTop: "24px",
          }}
        >
          Retour à Cartéo
        </Link>
      </div>
    </main>
  );
}
