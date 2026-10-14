import { verifiedAppleNotification, appleSignedDataVerifier } from "./appleOfficialServer";
import { applePremiumDecision } from "./applePremiumDecision";

/** Parse an authenticated Apple V2 notification. No Firebase writes until the
 * originalTransactionId has been securely bound to an authenticated Firebase UID.
 * A notification alone MUST NOT select an account based on client-controlled fields.
 */
export async function resolveAppleNotification(signedPayload: string, environment: "Production" | "Sandbox") {
  const notification = await verifiedAppleNotification(signedPayload, environment);
  const signedTransaction = notification.data?.signedTransactionInfo;
  if (!signedTransaction) throw new Error("missing-notification-transaction");
  const transaction = await appleSignedDataVerifier(environment).verifyAndDecodeTransaction(signedTransaction);
  if (!transaction.originalTransactionId || !transaction.transactionId || !transaction.productId) throw new Error("missing-transaction-identifiers");
  const subscriptions = (process.env.APPLE_PREMIUM_SUBSCRIPTION_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const lifetime = (process.env.APPLE_PREMIUM_LIFETIME_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!subscriptions.length && !lifetime.length) throw new Error("missing-premium-product-allowlist");
  const decision = applePremiumDecision({
    productId: transaction.productId,
    transactionId: transaction.transactionId,
    originalTransactionId: transaction.originalTransactionId,
    expiresDate: transaction.expiresDate,
    revocationDate: transaction.revocationDate,
    environment,
  }, subscriptions, lifetime, environment);
  // Terminal events must not leave a previously active entitlement enabled.
  // Unknown events are rejected until their entitlement semantics are reviewed.
  const eventType = notification.notificationType;
  if (eventType === "REFUND" || eventType === "REVOKE") {
    decision.status = "revoked";
    decision.expiresAt = null;
  } else if (eventType === "EXPIRED" || eventType === "GRACE_PERIOD_EXPIRED") {
    decision.status = "expired";
  } else if (!["SUBSCRIBED", "DID_RENEW", "DID_RECOVER", "DID_CHANGE_RENEWAL_PREF", "DID_CHANGE_RENEWAL_STATUS", "DID_FAIL_TO_RENEW", "OFFER_REDEEMED", "PRICE_INCREASE", "RENEWAL_EXTENDED", "REFUND_DECLINED", "CONSUMPTION_REQUEST", "TEST"].includes(eventType ?? "")) {
    throw new Error("unsupported-apple-notification-type");
  }
  return {
    notificationUUID: notification.notificationUUID,
    signedDate: notification.signedDate,
    notificationType: notification.notificationType,
    subtype: notification.subtype,
    originalTransactionId: transaction.originalTransactionId,
    transactionId: transaction.transactionId,
    productId: transaction.productId,
    decision,
  };
}
