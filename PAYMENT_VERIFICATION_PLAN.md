# Payment verification implementation status (staging only)

## Google Play

`app/lib/googlePlayVerifier.ts` is a read-only verifier for subscription
purchases and one-time lifetime purchases. It uses the Android Publisher API
with an independently provisioned service account, checks an allowlisted
product ID, checks current purchase state/expiry, and rejects purchases not
cryptographically associated with the authenticated Firebase UID via Google's
`obfuscatedExternalAccountId` value.

It does **not** accept unauthenticated purchase claims, grant Premium, write
Firestore, or expose a public purchase endpoint.

Required future server environment variables:
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (dedicated Play API service account,
  with minimal Google Play Console permission to view purchases)
- `GOOGLE_PLAY_PACKAGE_NAME` (the real signed Android package ID)

Before creating a new Android purchase, BillingClient must set
`setObfuscatedAccountId(playObfuscatedAccountId(firebaseUID))`, using
the exact SHA-256 UTF-8 convention in the server module. Verify the
actual Android product IDs in Play Console against the allowlist before
enabling. Existing purchases without this account binding must NOT be
silently claimed by a different account.

The server must authenticate Firebase ID tokens and bind the verified
purchase to the token's UID; never accept a UID string supplied by the
client as proof of ownership. A backend writer and locked-down Firestore
rules are still required. Purchase notifications (Google RTDN) and periodic
reconciliation are needed to keep entitlements accurate after expiration,
refund, renewal, or cancellation.

## Apple App Store

**Not implemented yet.** Use the official App Store Server API and Apple's
official signed-data verifier, including certificate-chain verification,
expected bundle ID, environment, app Apple ID and signed transaction fields.
Check product IDs, expiration, revocation and ownership binding before
granting Premium. Existing iOS StoreKit purchases were made without a
Firebase-linked appAccountToken, so those users need a secure restoration
and account-association flow. Never grant server Premium from a client
`isPremium` flag or an unverified JWS payload.

Implement App Store Server Notifications V2, idempotent transaction handling,
and scheduled reconciliation. Keep lifetime access valid unless revoked.

## Release blocker

**Do not set `SERVER_PREMIUM_ACCESS_ENABLED=true` on Vercel.** This is
preparatory code, not a finished payment verification system. Legacy users
must keep their current public cards and QR codes until a secure, tested
migration is available. The server-side verifier currently does not create
or update `premiumEntitlements` documents.
