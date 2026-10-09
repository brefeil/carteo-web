import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { playObfuscatedAccountId, verifyGooglePlayPurchase } from '../app/lib/googlePlayVerifier';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = privateKey.export({ type: 'pkcs8', format: 'pem' });
test('Google verification checks account, product, state and expiry; cancellation retains paid time', async () => {
  const originalFetch = globalThis.fetch;
  const originalAccount = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  const originalPackage = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'test@example.com', private_key: key });
  process.env.GOOGLE_PLAY_PACKAGE_NAME = 'cloud.carteo.connect';
  const now = new Date('2026-10-09T00:00:00Z');
  let response: Record<string, unknown> = {};
  let status = 200;
  globalThis.fetch = async (url) => String(url).includes('oauth2.googleapis.com')
    ? Response.json({ access_token: 'test-token' }) : Response.json(response, { status });
  const active = {
    externalAccountIdentifiers: { obfuscatedExternalAccountId: playObfuscatedAccountId('owner-a') },
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    lineItems: [{ productId: 'carteo_premium_monthly', expiryTime: '2026-11-09T00:00:00Z' }],
  };
  const verify = () => verifyGooglePlayPurchase('owner-a', 'carteo_premium_monthly', 'fake-purchase-proof', now);
  try {
    response = active; assert.ok(await verify());
    response = { ...active, subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }; assert.ok(await verify());
    response = { ...active, subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }; assert.equal(await verify(), null);
    response = { ...active, externalAccountIdentifiers: { obfuscatedExternalAccountId: playObfuscatedAccountId('owner-b') } }; assert.equal(await verify(), null);
    response = { ...active, lineItems: [{ productId: 'carteo_premium_yearly', expiryTime: '2026-11-09T00:00:00Z' }] }; assert.equal(await verify(), null);
    response = { ...active, lineItems: [{ productId: 'carteo_premium_monthly', expiryTime: '2026-10-08T00:00:00Z' }] }; assert.equal(await verify(), null);
    response = { purchaseState: 2, obfuscatedExternalAccountId: playObfuscatedAccountId('owner-a') };
    assert.equal(await verifyGooglePlayPurchase('owner-a', 'carteo_premium_lifetime_299', 'fake', now), null);
    response = { purchaseState: 0, obfuscatedExternalAccountId: playObfuscatedAccountId('owner-a') };
    assert.equal((await verifyGooglePlayPurchase('owner-a', 'carteo_premium_lifetime_299', 'fake', now))?.productType, 'lifetime');
    status = 404; assert.equal(await verify(), null);
    status = 503; await assert.rejects(verify());
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAccount === undefined) delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON; else process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = originalAccount;
    if (originalPackage === undefined) delete process.env.GOOGLE_PLAY_PACKAGE_NAME; else process.env.GOOGLE_PLAY_PACKAGE_NAME = originalPackage;
  }
});
