import { NextRequest, NextResponse } from "next/server";
import { resolveAppleNotification } from "../../../../lib/appleNotificationResolver";
import { lookupAppleTransactionOwner } from "../../../../lib/applePurchaseBinding";
import { projectApplePremiumToOwnerCards } from "../../../../lib/applePremiumProjection";

export const runtime = "nodejs";

/** Apple App Store Server Notifications V2. Apple authenticates using signedPayload. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { signedPayload?: unknown };
    if (typeof body.signedPayload !== "string" || body.signedPayload.length > 100000 || !body.signedPayload) {
      return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
    }
    let event: Awaited<ReturnType<typeof resolveAppleNotification>> | undefined;
    for (const environment of ["Production", "Sandbox"] as const) {
      try { event = await resolveAppleNotification(body.signedPayload, environment); break; }
      catch { /* Attempt the other Apple trust environment. */ }
    }
    if (!event) return NextResponse.json({ error: "unverified-notification" }, { status: 401 });
    const uid = await lookupAppleTransactionOwner(event.originalTransactionId);
    // Apple may notify us before the user first binds their transaction.
    // A subsequent authenticated app purchase/restore call will reconcile it.
    if (!uid) return NextResponse.json({ received: true, linked: false });
    const updatedCards = await projectApplePremiumToOwnerCards({
      uid, originalTransactionId: event.originalTransactionId,
      transactionId: event.transactionId, productId: event.productId,
      decision: event.decision,
      eventTime: Date.now(),
    });
    return NextResponse.json({ received: true, linked: true, updatedCards });
  } catch {
    // Return a retriable response when Firestore is unavailable.
    return NextResponse.json({ error: "notification-processing-failed" }, { status: 503 });
  }
}
