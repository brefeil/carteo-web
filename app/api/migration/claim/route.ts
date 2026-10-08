import { NextRequest, NextResponse } from "next/server";

// SECURITY: No client-side proof (slug, email, name or ID token alone) proves
// ownership of a legacy profile. Claims must only be issued by a trusted
// identity-verification workflow. This endpoint deliberately fails closed.
export const runtime = "nodejs";

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      error: "migration_verification_not_configured",
      message: "Legacy card ownership must be verified by a trusted backend before migration.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
