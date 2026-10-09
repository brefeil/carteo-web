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

A standalone Firebase Secure Token ID token verifier is staged in `app/lib/firebaseIdTokenVerifier.ts`. It checks Google's RS256 signature, Firebase project audience/issuer, time claims and the Google signing certificate. This is not yet wired to a production endpoint. For higher-assurance purchase changes, also check token revocation/disabled users with Firebase Admin SDK (or an equivalent trusted lookup), apply request throttling, and do not treat token validation alone as proof of purchase ownership.\n\nThe server must authenticate Firebase ID tokens and bind the verified
purchase to the token's UID; never accept a UID string supplied by the
client as proof of ownership. A backend writer and locked-down Firestore
rules are still required. Purchase notifications (Google RTDN) and periodic
reconciliation are needed to keep entitlements accurate after expiration,
refund, renewal, or cancellation.

## Apple App Store

The read-only App Store Server API transport is staged in `app/lib/appStoreServerClient.ts`. The fail-closed policy for *already verified* Apple transactions is staged in `app/lib/appleVerifiedTransactionPolicy.ts` with isolated checks. **Cryptographic JWS verification is NOT implemented yet**, so the Apple transport output must not be passed directly into that policy or used to grant access. Integrate the official App Store Server API and Apple's
official signed-data verifier, including certificate-chain verification,
expected bundle ID, environment, app Apple ID and signed transaction fields.
Check product IDs, expiration, revocation and ownership binding before
granting Premium. Existing iOS StoreKit purchases were made without a
Firebase-linked appAccountToken, so those users need a secure restoration
and account-association flow. Never grant server Premium from a client
`isPremium` flag or an unverified JWS payload.

For new purchases, provision and persist a server-generated UUID `appAccountToken` bound to the authenticated Firebase UID *before* purchase. The expected UUID must be loaded from a trusted server record, never accepted from a client request. Existing transactions lacking this binding require an explicit secure restoration and ownership migration. Verify the App Store Apple ID in production when applicable.\n\nImplement App Store Server Notifications V2, idempotent transaction handling,
and scheduled reconciliation. Keep lifetime access valid unless revoked.

## Firebase entitlement storage and ownership\n\nThe Web repository currently has no deployable `firestore.rules` or `firebase.json` in this branch. Do not assume Firestore client write access is restricted. The pure purchase ownership decision module `app/lib/purchaseOwnershipPolicy.ts` is staged, with checks; it does NOT perform atomic Firestore transactions or claim purchases. Before enabling: lock `premiumEntitlements/{uid}` against ALL client writes; use server-only Admin credentials; create a transaction ownership ledger keyed by `store + originalTransactionId` with an atomic claim to one UID; reject reassignment to a different UID; use verified notifications plus periodic reconciliation; and test legacy compatibility before deploying rules. Never replace an active entitlement with an inactive one based solely on a missing or transient failed verification.\n\n## Release blocker

**Do not set `SERVER_PREMIUM_ACCESS_ENABLED=true` on Vercel.** This is
preparatory code, not a finished payment verification system. Legacy users
must keep their current public cards and QR codes until a secure, tested
migration is available. The server-side verifier currently does not create
or update `premiumEntitlements` documents.
