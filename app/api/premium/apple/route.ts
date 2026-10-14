import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseUser } from "../../../lib/firebasePremiumAdmin";
import { verifiedAppleTransaction } from "../../../lib/appleOfficialServer";
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
  try {
    const bearer = request.headers.get("authorization") ?? "";
    if (!bearer.startsWith("Bearer ")) return NextResponse.json({ error: "auth-required" }, { status: 401 });
    const uid = await verifyFirebaseUser(bearer.slice(7));
    const body = await request.json() as { transactionId?: string; environment?: string };
    if (!/^\d{6,30}$/.test(body.transactionId ?? "") || (body.environment !== "Production" && body.environment !== "Sandbox")) return NextResponse.json({ error: "invalid-request" }, { status: 400 });
    const transaction = await verifiedAppleTransaction(body.transactionId!, body.environment);
    if (!transaction.originalTransactionId || !transaction.productId || !transaction.transactionId) throw new Error("incomplete-transaction");
    const subscriptions = (process.env.APPLE_PREMIUM_SUBSCRIPTION_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const lifetime = (process.env.APPLE_PREMIUM_LIFETIME_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const decision = applePremiumDecision({ productId: transaction.productId, transactionId: transaction.transactionId, originalTransactionId: transaction.originalTransactionId, expiresDate: transaction.expiresDate, revocationDate: transaction.revocationDate, environment: body.environment }, subscriptions, lifetime, body.environment);
    if (!appleAccountTokenMatchesUid(transaction.appAccountToken, uid)) return NextResponse.json({ error: "purchase-owner-mismatch" }, { status: 403 });
    await bindVerifiedAppleTransaction(transaction.originalTransactionId, uid);
    const updatedCards = await projectApplePremiumToOwnerCards({ uid, originalTransactionId: transaction.originalTransactionId, transactionId: transaction.transactionId, productId: transaction.productId, decision, eventTime: Date.now() });
    return NextResponse.json({ verified: true, bound: true, status: decision.status, entitlementGranted: decision.status === "active" && updatedCards > 0, updatedCards });
  } catch {
    return NextResponse.json({ error: "purchase-verification-failed" }, { status: 422 });
  }
}
