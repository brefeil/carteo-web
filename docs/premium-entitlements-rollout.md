# Cartéo Premium — safe rollout plan (NOT deployed)

## Invariant
A published card's `profiles/{slug}` document ID, public URL, and QR payload MUST remain unchanged on subscription changes. Wallet QR continues to point at that URL. Updating the visible Apple/Google Wallet pass artwork is a separate pass-update concern.

## Identity versus purchase
Firebase Authentication (Apple on iOS / Google on Android) identifies the account, but is **not** proof of purchase. App Store StoreKit transaction identifiers and Google Play Billing purchase tokens must be verified by a trusted backend using the respective store APIs. Bind each verified purchase to the Firebase UID, preventing cross-account reuse. Support restore purchases and account changes.

## Trusted server data
- `entitlements/{uid}`: `verified`, `status`, `source` (apple/google/admin_grant), `productType` (subscription/lifetime/grant), `expiresAt`, verified store identifiers and last checked timestamp.
- `profiles/{slug}.entitlementMigrationVersion=1`: set ONLY after the account ownership and store purchase have been reconciled. This marker is not client-writable.
- The old `profiles/{slug}.isPremium` is legacy-only and must never grant new purchases or be editable by clients.
- Backend uses service credentials. Firestore client security rules must deny all client writes to entitlements and migration markers.

## Display algorithm
- Legacy (no migration marker): preserve current display to avoid cutting off existing customers.
- Migrated: derive Premium exclusively from verified entitlement of the linked `ownerUID`.
- Expired/revoked/refunded subscription: Free presentation on app and Cloud; keep card data and same QR.
- Renewed/verified/granted Premium: Premium presentation returns automatically.
- Free: exactly one chosen social (including LinkedIn) on public page and vCard; Premium: all.
- For Wallet: Free principal card remains eligible; Premium permits all cards. Avoid deleting already issued QR; update pass visuals separately.

## Implementation order
1. Add unit tests for active, expired, revoked, lifetime, grant, missing record, and legacy.
2. Add trusted verification endpoints with Firebase ID token auth, App Store Server API, Google Play Developer API and notifications (App Store Server Notifications V2 / RTDN), idempotency and replay protections.
3. Create secure Firestore rules, Storage rules and emulator tests for owner isolation, legacy migration and forbidden Premium writes.
4. Reconcile existing purchases and UID ownership; mark migrated profiles in controlled batches.
5. Connect iOS/Android entitlements and public page + vCard + Wallet, then verify same QR across transitions.
6. Deploy behind a controlled migration after production smoke tests.

**Do not merge a change that reads new entitlements as the only source before purchase verification and migration exist.**
