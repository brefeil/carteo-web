# Android account API — staging integration

Based on `feature/server-premium-access-v2`. This branch adds an opt-in Android API;
it is not a production rollout and must not be merged/deployed as a completed
cross-platform subscription system.

## Implemented

- Firebase Admin verifies ID tokens **including revocation/disabled accounts**.
  Anonymous sessions and client-supplied owner/Premium/primary fields are refused.
- `POST /api/android/cards` accepts a card, verifies the account's known Google
  proofs live, and writes through a Firestore transaction. A shared account
  document serializes different-slug creates across devices. Free users can
  create only one card, edit only their primary card, use one social network
  and the blue/mint themes. Existing legacy cards require trusted migration.
- `GET /api/android/cards` returns only profiles owned by the authenticated UID.
- `POST /api/android/purchases/verify` accepts `{ "proofs": [{ "productId": "…",
  "purchaseToken": "…" }] }`. It checks Google, binds each proof atomically to
  one UID and returns `{ premium, validUntilMs, verifiedTokens }`. No client
  flag grants access. The client lease lasts at most five minutes; every server
  Premium write verifies Google again. Transient verification errors deny the
  operation without deleting stored purchase proofs.
- Subscriptions canceled by the user retain access until their verified expiry.
- Per-account throttling: 30 API calls/minute. JSON bodies are limited to 32 KiB.
  Tokens and profiles are not logged. Redirects are disabled by the Android client.
- Android queries account-owned Firestore cards in real time. Its default build
  retains the existing direct publishing path. The API/Billing path is opt-in;
  **it never silently falls back to direct writes after an API failure**.

## Test configuration

Use an isolated Firebase project and Play license testers. Required server vars:

- `ANDROID_API_ENABLED=true` (unset returns 404 before Firebase initialization)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON` (dedicated Admin service account for that project)
- `FIREBASE_STORAGE_BUCKET` (for owner-scoped Firebase Storage avatar URLs)
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (Play API account)
- `GOOGLE_PLAY_PACKAGE_NAME=cloud.carteo.connect`

Use `firebase/android-staging.rules` only in the test project. It denies every
client mutation and every read of private purchase/account records. Admin routes
bypass those rules. It is intentionally incompatible with current production iOS
writes; never apply it to production without a coordinated migration. Configure
owner-scoped Storage rules separately before testing photo uploads.

Build Android with `-PcarteoApiEnabled=true` and
`-PcarteoApiBaseUrl=https://your-test-host`. Use matching Android Firebase config.
The default is `carteoApiEnabled=false`. Product IDs must exist in Play Console;
prices are loaded from Play. Only regular monthly/yearly base plans are offered;
trials and promotional offers need dedicated price/terms presentation.

## Validation

- `npm run test:android`: validation, ownership, bounded requests, purchase data,
  account binding, pending/expired/canceled purchases, provider failures.
- `npm run test:android:emulator`: Java 21+; isolated `demo-carteo-api`, real
  Firestore transactions and client rules, including simultaneous free creates.
- `npx tsc --noEmit` and `npm run build`.
- GitHub workflow `Android API security` runs these unit/emulator/type checks.

## Remaining release gates

1. Real-device Play testing: new purchase, pending payment, cancellation, restore,
   wrong Firebase account, app restart, acknowledgement retry and token expiry.
2. Reconcile Google RTDN/refunds and App Store verified transactions with the
   cross-platform `premiumEntitlements` collection. This API stores Google
   proofs in **androidPlayPurchases** and does **not** yet write permanent
   entitlements used by the public resolver. Do not enable purchases for real
   customers until public pages, vCards and Wallet use those verified grants.
3. Keep `SERVER_PREMIUM_ACCESS_ENABLED` unset in production until its independent
   rollout requirements are met. Existing iOS data, URLs and Wallet remain on
   their current production behavior.
4. Validate actual avatar image bytes, not just MIME metadata/size; implement
   account/card deletion and proof retention policy before public release.
5. Reconcile this branch with current main and complete legacy ownership/primary
   migration before tightening live Firestore rules.

Official implementation references:
- https://developer.android.com/google/play/billing/integrate
- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://firebase.google.com/docs/firestore/manage-data/transactions
