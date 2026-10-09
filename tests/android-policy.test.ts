import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCard, assertCardWrite, ApiError } from '../app/lib/android/policy';
import { parseProofs } from '../app/lib/android/purchases';
import { authenticate, readJson } from '../app/lib/android/admin';
const card = { publicSlug: 'nico-123', firstName: 'Nicolas', theme: 'blue' };
function rejects(fn: () => unknown, code: string) { assert.throws(fn, (e: unknown) => e instanceof ApiError && e.code === code); }
test('client cannot submit ownership, primary or premium flags', () => {
  for (const key of ['ownerUID', 'isPrimary', 'isPremium', 'schemaVersion']) rejects(() => parseCard({ ...card, [key]: true }, true, 'a'), 'unknown-card-field');
});
test('free social count includes X and rejects paid themes', () => {
  rejects(() => parseCard({ ...card, x: 'nico', instagram: 'nico' }, false, 'a'), 'free-social-limit');
  rejects(() => parseCard({ ...card, theme: 'gold' }, false, 'a'), 'premium-theme');
  assert.equal(parseCard({ ...card, theme: 'gold', x: 'nico', instagram: 'nico' }, true, 'a').theme, 'gold');
});
test('social domains, aliases, credentials and mismatched platforms are rejected', () => {
  for (const website of ['https://instagram.com./nico', 'https://m.youtube.com/nico', 'https://fb.me/nico']) rejects(() => parseCard({ ...card, website }, false, 'a'), 'social-in-website');
  rejects(() => parseCard({ ...card, x: 'https://facebook.com/nico' }, true, 'a'), 'invalid-social');
  rejects(() => parseCard({ ...card, website: 'https://instagram.com@example.com' }, false, 'a'), 'invalid-url');
});
test('slug is immutable document identity and bounded', () => {
  for (const publicSlug of ['../../other', 'a/b', 'x'.repeat(101), '']) rejects(() => parseCard({ ...card, publicSlug }, false, 'a'), 'invalid-slug');
});
test('ownership and legacy migration are required even with Premium', () => {
  rejects(() => assertCardWrite({ ownerUID: 'b', schemaVersion: 3 }, 'a', 'one', [], true), 'not-owner');
  rejects(() => assertCardWrite({ ownerUID: 'a', schemaVersion: 1 }, 'a', 'one', ['one'], true), 'migration-required');
  rejects(() => assertCardWrite(undefined, 'a', 'two', ['one'], false), 'free-card-limit');
});
test('purchase proofs cannot smuggle UID or unknown products', () => {
  rejects(() => parseProofs({ proofs: [], uid: 'b' }), 'invalid-proofs');
  rejects(() => parseProofs({ proofs: [{ productId: 'free-premium', purchaseToken: 'fake' }] }), 'invalid-proof');
  rejects(() => parseProofs({ proofs: new Array(11).fill({}) }), 'invalid-proofs');
  assert.deepEqual(parseProofs({ proofs: [] }), []);
});
test('disabled API and missing bearer fail before Admin credentials are accessed', async () => {
  delete process.env.ANDROID_API_ENABLED;
  await assert.rejects(authenticate(new Request('https://example.com')), (e: unknown) => e instanceof ApiError && e.status === 404);
  process.env.ANDROID_API_ENABLED = 'true';
  await assert.rejects(authenticate(new Request('https://example.com')), (e: unknown) => e instanceof ApiError && e.status === 401);
  delete process.env.ANDROID_API_ENABLED;
});
test('body parser rejects oversized and malformed JSON', async () => {
  await assert.rejects(readJson(new Request('https://example.com', { method: 'POST', headers: {'content-type':'application/json'}, body: 'x'.repeat(32769) })), (e: unknown) => e instanceof ApiError && e.status === 413);
  await assert.rejects(readJson(new Request('https://example.com', { method: 'POST', headers: {'content-type':'application/json'}, body: '{' })), (e: unknown) => e instanceof ApiError && e.status === 400);
});
