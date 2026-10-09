# Server-verified Premium rollout (NOT LIVE)

The new public card resolver is wired into the web profile, vCard, social
preview, Apple Wallet pass creation and Google Wallet pass creation. It is
**disabled by default**: `SERVER_PREMIUM_ACCESS_ENABLED` must remain unset
until the following prerequisites are complete.

1. A trusted backend verifies App Store Server API / App Store Server
   Notifications V2 and Google Play Developer API / RTDN, including
   refunds, revocations, grace periods, cancellations, expiry, renewals,
   lifetime purchases, and restored purchases. Client flags and unsigned
   purchase payloads must never grant access.
2. Backend writes `premiumEntitlements/{ownerUID}` with
   `status: "active" | "inactive"`,
   `productType: "subscription" | "lifetime"`, and subscription
   `expiresAt` as an ISO-8601 timestamp string. This collection must be
   **server-write-only** in deployed Firestore rules. The current code
   only READS these records; it does not verify payments or write grants.
3. New/migrated `profiles/{slug}` require `ownerUID`,
   `schemaVersion: 2`, and a trusted, immutable `isPrimary` designation.
   Only the actual owner may change profile content; they may not choose
   their own primary status or entitlement. Existing legacy cards must
   retain their URLs and be migrated through a trusted ownership process.
4. Test active, expired, refunded, lifetime, missing, and invalid grants,
   multiple cards, primary vs secondary, QR URL stability, vCard, social
   previews, and Wallet generation. Ensure the primary card has only the
   free features and secondary cards return the same neutral unavailable
   page without revealing subscription details.
5. Implement Wallet pass update / revocation mechanisms: previously saved
   passes can retain old printed fields until updated. A stable QR still
   opens the server-controlled URL; it does not make static pass fields
   disappear automatically.
6. Audit social-link restrictions in Apple Wallet pass generation and
   existing public pages. Do not enable the flag until free-tier
   enforcement is consistent across all public surfaces.
7. Test against a Firebase staging project, then perform a controlled
   rollout with monitoring and rollback.

When the flag is **unset**, the existing legacy behavior is unchanged,
including its known weakness: `isPremium` is currently written by the
iOS client and must not be treated as authoritative after rollout.

When the flag is **enabled**, missing v2 ownership/primary fields cause
the public profile to fail closed. Secondary cards without a verified
active entitlement return a generic 404, while primary cards downgrade
to free features. Any entitlement lookup error other than a missing
document fails closed rather than silently granting Premium.

Do not set the flag on production until all prerequisites are satisfied.

## Free-tier projection (staged)

When verified Premium is absent or expired, the public resolver returns only
the free contact fields: name, phone, email, and the first nonempty social
network in a stable order. It strips Premium-only presentation fields such as
job title, company, website, biography, photo, wallet thumbnails, and theme.
This projection applies to public Web, vCard and newly generated Apple/Google
Wallet passes through the shared resolver. It does not delete saved Firestore
values. The existing QR URL is unchanged.

**Important:** Wallet passes already installed on phones may retain previously
embedded Premium details until an update mechanism is implemented. This is
not yet a complete privacy guarantee for previously issued passes. Also
confirm exact free-plan field policy with product before rollout.
