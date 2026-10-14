import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseUser } from "../../../lib/firebasePremiumAdmin";
import { appleAccountTokenForUid } from "../../../lib/appleAccountToken";
export const runtime = "nodejs";
/** iOS must fetch this after Firebase login, and pass it to StoreKit purchase(appAccountToken:). */
export async function GET(request: NextRequest) {
  const bearer = request.headers.get("authorization") ?? "";
  if (!bearer.startsWith("Bearer ")) return NextResponse.json({ error: "auth-required" }, { status: 401 });
  try {
    const uid = await verifyFirebaseUser(bearer.slice(7));
    return NextResponse.json({ appAccountToken: appleAccountTokenForUid(uid) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "auth-failed" }, { status: 401 }); }
}
