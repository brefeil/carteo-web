# Premium gifts — implementation plan

Status: policy module only. **Not enabled in production.**

## Trust boundaries
- Firebase Auth identifies the recipient by UID; never by display name or e-mail alone.
- The server verifies a Firebase ID token and checks the actor's administrator status from a server-owned allowlist or custom claim.
- The server computes start and expiry times; clients cannot write gift grants or change premium flags.
- Store subscriptions and gifts are independent entitlements. A revoked/expired gift never cancels a valid paid subscription.
- Re-check entitlement on privileged writes, not only in the UI.
- Do not grant premium through a public Vercel API endpoint without server-side token verification, authorization, rate limits and an audit log.

## Proposed Firestore data
Private collection `premiumGrants/{grantId}` with recipientUid, reason, duration, startsAt, expiresAt, status, grantedBy, createdAt, revokedAt. Reject direct client writes. A server-only audit log records each operation.

## Next integration work
1. Identify existing Firebase Admin configuration and current subscription verification implementation.
2. Implement authenticated admin grant/revoke/list endpoints with transactional writes and idempotency keys.
3. Update shared entitlement verification used by server write paths.
4. Add a protected /admin UI, confirmation and recipient lookup.
5. Update iOS Swift and Android Kotlin entitlement display and refresh.
6. Queue transactional e-mail after a committed grant, deduplicate retries, never e-mail on failed activation.
7. Add emulator tests for unauthorized requests, expiry, revocation, concurrent grants, and paid subscriptions.
8. Check Apple/Google policy compliance and test on both platforms before merging or deploying.

The `lib/premium-gifts/policy.ts` module is a pure policy building block. It does not write Firestore or confer access by itself.
