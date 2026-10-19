import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseUser } from "../../../lib/firebasePremiumAdmin";
import { verifiedAppleTransaction, verifiedAppleSignedTransaction } from "../../../lib/appleOfficialServer";
import { applePremiumDecision } from "../../../lib/applePremiumDecision";
import { appleAccountTokenMatchesUid } from "../../../lib/appleAccountToken";
import { bindVerifiedAppleTransaction } from "../../../lib/applePurchaseBinding";
import { projectApplePremiumToOwnerCards } from "../../../lib/applePremiumProjection";

export const runtime = "nodejs";
/** Phase 1: verify a purchase, but never grant Premium without securely
 * linking Apple's appAccountToken to the authenticated Firebase user.
 * Do not remove this fail-closed guard before implementing that binding.
 */
export async function POST(request: NextRequest) {
  let stage = "authentication";
  try {
    const bearer = request.headers.get("authorization") ?? "";
    if (!bearer.startsWith("Bearer ")) return NextResponse.json({ error: "auth-required" }, { status: 401 });
    const uid = await verifyFirebaseUser(bearer.slice(7));
    const body = await request.json() as { transactionId?: string; environment?: string; signedTransactionInfo?: string };
    if (!/^\d{6,30}$/.test(body.transactionId ?? "") || (body.environment !== "Production" && body.environment !== "Sandbox")) return NextResponse.json({ error: "invalid-request" }, { status: 400 });
    stage = "apple-transaction";
    const transaction = typeof body.signedTransactionInfo === "string"
      ? await verifiedAppleSignedTransaction(body.signedTransactionInfo, body.environment)
      : await verifiedAppleTransaction(body.transactionId!, body.environment);
    if (transaction.transactionId !== body.transactionId) return NextResponse.json({ error: "signed-transaction-mismatch" }, { status: 400 });
    if (!transaction.originalTransactionId || !transaction.productId || !transaction.transactionId) throw new Error("incomplete-transaction");
    const subscriptions = (process.env.APPLE_PREMIUM_SUBSCRIPTION_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const lifetime = (process.env.APPLE_PREMIUM_LIFETIME_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
    stage = "entitlement-decision";
    const decision = applePremiumDecision({ productId: transaction.productId, transactionId: transaction.transactionId, originalTransactionId: transaction.originalTransactionId, expiresDate: transaction.expiresDate, revocationDate: transaction.revocationDate, environment: body.environment }, subscriptions, lifetime, body.environment);
    stage = "account-binding";
    if (!appleAccountTokenMatchesUid(transaction.appAccountToken, uid)) return NextResponse.json({ error: "purchase-owner-mismatch" }, { status: 403 });
    stage = "binding-write";
    await bindVerifiedAppleTransaction(transaction.originalTransactionId, uid);
    stage = "firebase-projection";
    const updatedCards = await projectApplePremiumToOwnerCards({ uid, originalTransactionId: transaction.originalTransactionId, transactionId: transaction.transactionId, productId: transaction.productId, decision, eventTime: transaction.purchaseDate ?? 0 });
    return NextResponse.json({ verified: true, bound: true, status: decision.status, entitlementGranted: decision.status === "active" && updatedCards > 0, updatedCards });
  } catch (caught) {
    // Public diagnostics are fixed categories, not raw Apple exceptions or identifiers.
    const message = caught instanceof Error ? caught.message.toLowerCase() : "";
    const errorName = caught instanceof Error ? caught.name : "unknown";
    const safeErrorType = ["VerificationException", "APIException", "Error"].includes(errorName) ? errorName : "other";
    const signatureCheck = message.includes("signature") ? "signature"
      : message.includes("certificate") || message.includes("chain") || message.includes("trust") ? "trust-chain"
      : message.includes("bundle") || message.includes("app id") || message.includes("environment") ? "signed-claims"
      : message.includes("jws") || message.includes("jwt") ? "jws"
      : "unspecified";
    const reason = stage !== "apple-transaction" ? "other-stage"
      : message.includes("missing apple") || message.includes("invalid apple_app_id") ? "server-configuration"
      : message.includes("invalid-signed-transaction") ? "invalid-jws-format"
      : message.includes("certificate") || message.includes("trust") || message.includes("root") ? "certificate-verification"
      : message.includes("environment") || message.includes("bundle") || message.includes("app id") ? "signed-claims-mismatch"
      : message.includes("signature") || message.includes("verification") || message.includes("verify") ? "signed-transaction-verification"
      : "apple-transaction-unknown";
    console.error("[premium/apple] failed:", stage, reason, safeErrorType, signatureCheck);
    return NextResponse.json({ error: "purchase-verification-failed", stage, reason, verificationType: safeErrorType, verificationArea: signatureCheck }, { status: 422 });
  }
}
