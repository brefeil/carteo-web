import type { PremiumGift } from "./policy";

export interface GiftActivationEmail {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

/**
 * Build an email payload only AFTER the grant transaction commits.
 * The caller must validate the recipient's verified e-mail and enqueue this
 * payload in a server-controlled outbox. This function does not send mail.
 */
export function buildGiftActivationEmail(
  giftId: string,
  recipientEmail: string,
  gift: PremiumGift,
): GiftActivationEmail {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw new Error("Invalid recipient email");
  if (!giftId.trim() || gift.status !== "active") throw new Error("Invalid gift");
  const duration = gift.duration === "lifetime" ? "à vie" : `${gift.duration} mois`;
  const expiry = gift.expiresAt
    ? `Votre accès expire le ${new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(gift.expiresAt)} (UTC).`
    : "Votre accès est valable à vie, sous réserve des conditions du service.";
  return {
    to: recipientEmail,
    subject: "Votre accès Cartéo Premium offert est activé",
    text: `Bonjour,\n\nVotre accès Cartéo Premium offert pour ${duration} est activé.\n${expiry}\nAucun prélèvement ni renouvellement automatique n'est associé à ce cadeau.\n\nRetrouvez vos cartes sur Cartéo Connect.\n\nL'équipe Cartéo Connect\nsupport@carteo.cloud`,
    idempotencyKey: `premium-gift-activated:${giftId}`,
  };
}
