# Verified Premium integration — staging checklist

This branch intentionally ignores legacy `profiles/{slug}.isPremium` for public card and vCard visibility.

## Required trusted backend (not implemented here)
1. On iOS, obtain App Store signed transaction / app account token and send it to an authenticated backend. Validate with Apple's App Store Server API; associate transaction ownership with the Firebase UID. Never accept a client-supplied `isPremium` boolean.
2. On Android, send purchase tokens to an authenticated backend. Validate against the Google Play Developer API; bind purchases to the Firebase UID.
3. Configure App Store Server Notifications V2 and Google Real-time Developer Notifications. Validate notification authenticity, process renewals, cancellations, refunds, revocations and expirations, and periodically reconcile.
4. Trusted server writes `entitlements/{uid}` with `verified: true`, `status: "active"`, `store: "apple"|"google"`, `productType: "subscription"|"lifetime"`, `expiresAt: ISO8601` for subscriptions. Client writes to this collection MUST be denied by Firestore rules.
5. Consider verified entitlements across both stores and multiple purchases; this prototype models one active entitlement per UID and is not sufficient for production cross-platform account linking.
6. On reads, a missing, expired or unverified entitlement is Free. Store notifications keep state fresh; don't call Apple/Google on every page request. Add a reconciliation schedule for missed events.
7. Existing paid users need an entitlement backfill from validated receipts before deployment. Otherwise they will appear Free. Do not deploy this branch until migration and test coverage are complete.
8. Test with a separate Firebase project / emulator; never loosen production rules to run tests.
