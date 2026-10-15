import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseUser } from "../../../lib/firebasePremiumAdmin";
import { appleAccountTokenForUid } from "../../../lib/appleAccountToken";

export const runtime = "nodejs";

/** iOS fetches this after Firebase login and passes it to StoreKit purchase(appAccountToken:). */
export async function GET(request: NextRequest) {
  const bearer = request.headers.get("authorization") ?? "";
  if (!bearer.startsWith("Bearer ")) {
    return NextResponse.json({ error: "auth-required" }, { status: 401 });
  }

  let uid: string;
  try {
    uid = await verifyFirebaseUser(bearer.slice(7));
  } catch (error) {
    // Never log the bearer token or Firebase credentials.
    console.error("[premium/account-token] Firebase verification failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "auth-failed" }, { status: 401 });
  }

  try {
    const appAccountToken = appleAccountTokenForUid(uid);
    return NextResponse.json({ appAccountToken }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // A missing HMAC secret is a server configuration failure, not invalid user credentials.
    console.error("[premium/account-token] Token generation failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "premium-server-unavailable" }, { status: 503 });
  }
}
