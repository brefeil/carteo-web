import { beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { saveAndroidCard, deleteAndroidCard } from '../app/lib/android/cards';
import { ApiError } from '../app/lib/android/policy';
const projectId = 'demo-carteo-api';
const enabled = !!process.env.FIRESTORE_EMULATOR_HOST;
const app = enabled ? initializeApp({ projectId }, 'android-tests') : null;
const db = app ? getFirestore(app) : null;
beforeEach(async () => {
  if (enabled) {
    const result = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    assert.equal(result.ok, true);
  }
});
after(async () => { if (app) await deleteApp(app); });
const card = (publicSlug: string) => ({ publicSlug, firstName: 'Nicolas', theme: 'blue' });
test('deletion retires QR, is retry-safe and releases the last free slot', { skip: !enabled }, async () => {
  await saveAndroidCard(db!, 'owner-a', card('one'), false);
  await deleteAndroidCard(db!, 'owner-a', { publicSlug: 'one' });
  await deleteAndroidCard(db!, 'owner-a', { publicSlug: 'one' });
  assert.equal((await db!.doc('profiles/one').get()).exists, false);
  assert.equal((await db!.doc('androidAvatarCleanup/one').get()).get('objectPath'), 'avatars/owner-a/one.jpg');
  for (const uid of ['owner-a', 'owner-b']) {
    await assert.rejects(saveAndroidCard(db!, uid, card('one'), true), (e: unknown) => e instanceof ApiError && e.code === 'retired-slug');
  }
  await saveAndroidCard(db!, 'owner-a', card('new'), false);
  assert.equal((await db!.doc('profiles/new').get()).get('isPrimary'), true);
});
test('deletion refuses foreign owners, legacy cards and injected fields', { skip: !enabled }, async () => {
  await saveAndroidCard(db!, 'owner-a', card('one'), false);
  await assert.rejects(deleteAndroidCard(db!, 'owner-b', { publicSlug: 'one' }), (e: unknown) => e instanceof ApiError && e.code === 'not-owner');
  await assert.rejects(deleteAndroidCard(db!, 'owner-a', { publicSlug: 'one', ownerUID: 'owner-b' }), (e: unknown) => e instanceof ApiError && e.code === 'invalid-delete');
  await db!.doc('profiles/legacy').set({ ownerUID: 'owner-a', schemaVersion: 2 });
  await assert.rejects(deleteAndroidCard(db!, 'owner-a', { publicSlug: 'legacy' }), (e: unknown) => e instanceof ApiError && e.code === 'migration-required');
  assert.equal((await db!.doc('profiles/one').get()).exists, true);
});
test('primary deletion promotes an active card without reactivating disabled cards', { skip: !enabled }, async () => {
  for (const slug of ['one', 'disabled', 'active']) await saveAndroidCard(db!, 'owner-a', card(slug), true);
  await db!.doc('profiles/disabled').update({ isActive: false });
  await deleteAndroidCard(db!, 'owner-a', { publicSlug: 'one' });
  assert.equal((await db!.doc('androidCardAccounts/owner-a').get()).get('primarySlug'), 'active');
  assert.equal((await db!.doc('profiles/active').get()).get('isPrimary'), true);
  assert.equal((await db!.doc('profiles/disabled').get()).get('isActive'), false);
  await deleteAndroidCard(db!, 'owner-a', { publicSlug: 'disabled' });
  await saveAndroidCard(db!, 'owner-a', card('active'), false);
});
test('racing save and delete cannot resurrect the retired card', { skip: !enabled }, async () => {
  await saveAndroidCard(db!, 'owner-a', card('one'), false);
  const results = await Promise.allSettled([
    saveAndroidCard(db!, 'owner-a', card('one'), false),
    deleteAndroidCard(db!, 'owner-a', { publicSlug: 'one' }),
  ]);
  assert.equal(results[1].status, 'fulfilled');
  assert.equal((await db!.doc('profiles/one').get()).exists, false);
});
test('concurrent free creates on two devices yield exactly one card', { skip: !enabled }, async () => {
  const results = await Promise.allSettled([
    saveAndroidCard(db!, 'owner-a', card('one'), false),
    saveAndroidCard(db!, 'owner-a', card('two'), false),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const failure = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal(failure.reason.code, 'free-card-limit');
  assert.equal((await db!.collection('profiles').get()).size, 1);
});
test('retries preserve slug and do not consume a second free slot', { skip: !enabled }, async () => {
  await Promise.all([saveAndroidCard(db!, 'owner-a', card('one'), false), saveAndroidCard(db!, 'owner-a', card('one'), false)]);
  assert.equal((await db!.collection('profiles').get()).size, 1);
  assert.equal((await db!.doc('androidCardAccounts/owner-a').get()).get('primarySlug'), 'one');
});
test('cannot overwrite another owner or silently claim a legacy card', { skip: !enabled }, async () => {
  await db!.doc('profiles/one').set({ ownerUID: 'owner-b', schemaVersion: 3, name: 'Other' });
  await assert.rejects(saveAndroidCard(db!, 'owner-a', card('one'), true), (e: unknown) => e instanceof ApiError && e.code === 'not-owner');
  await db!.doc('profiles/legacy').set({ ownerUID: 'owner-a', schemaVersion: 1 });
  await assert.rejects(saveAndroidCard(db!, 'owner-a', card('legacy'), true), (e: unknown) => e instanceof ApiError && e.code === 'migration-required');
});
test('verified Premium permits second card; expiry restricts secondary edits', { skip: !enabled }, async () => {
  await saveAndroidCard(db!, 'owner-a', card('one'), true);
  await saveAndroidCard(db!, 'owner-a', card('two'), true);
  assert.equal((await db!.doc('profiles/two').get()).get('isPrimary'), false);
  await assert.rejects(saveAndroidCard(db!, 'owner-a', card('two'), false), (e: unknown) => e instanceof ApiError && e.code === 'secondary-card-requires-premium');
  await saveAndroidCard(db!, 'owner-a', card('one'), false);
});
test('editing never reactivates a disabled card', { skip: !enabled }, async () => {
  await db!.doc('profiles/one').set({ ownerUID: 'owner-a', schemaVersion: 2, isActive: false });
  await saveAndroidCard(db!, 'owner-a', card('one'), false);
  assert.equal((await db!.doc('profiles/one').get()).get('isActive'), false);
});

test('staged rules deny forged client cards, entitlement grants and purchase-token reads', { skip: !enabled }, async () => {
  const clientAppSdk = await import('firebase/app');
  const sdk = await import('firebase/firestore');
  const clientApp = clientAppSdk.initializeApp({ projectId, apiKey: 'demo-key', appId: 'demo-app' }, 'attacker-client');
  const clientDb = sdk.getFirestore(clientApp);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
  sdk.connectFirestoreEmulator(clientDb, host, Number(port), { mockUserToken: { sub: 'owner-a' } });
  try {
    for (const path of ['profiles/forged', 'premiumEntitlements/owner-a', 'androidCardAccounts/owner-a', 'androidPlayPurchases/fake', 'androidDeletedCards/one', 'androidAvatarCleanup/one']) {
      await assert.rejects(sdk.setDoc(sdk.doc(clientDb, path), { ownerUID: 'owner-a', isPremium: true }), (e: unknown) => (e as {code?: string}).code === 'permission-denied');
    }
    await assert.rejects(sdk.getDoc(sdk.doc(clientDb, 'androidPlayPurchases/fake')), (e: unknown) => (e as {code?: string}).code === 'permission-denied');
  } finally {
    await sdk.terminate(clientDb);
    await clientAppSdk.deleteApp(clientApp);
  }
});

test('avatar cleanup is scoped and retryable after a Storage failure', { skip: !enabled }, async () => {
  const { cleanupDeletedAvatar } = await import('../app/lib/android/cards');
  await saveAndroidCard(db!, 'owner-a', card('one'), false);
  await deleteAndroidCard(db!, 'owner-a', { publicSlug: 'one' });
  await db!.doc('androidAvatarCleanup/one').update({ objectPath: 'avatars/owner-b/other.jpg' });
  let path = '';
  assert.equal(await cleanupDeletedAvatar(db!, 'owner-a', 'one', async p => { path = p; throw new Error('offline'); }), false);
  assert.equal(path, 'avatars/owner-a/one.jpg');
  assert.equal((await db!.doc('profiles/one').get()).exists, false);
  assert.equal((await db!.doc('androidAvatarCleanup/one').get()).exists, true);
  await assert.rejects(cleanupDeletedAvatar(db!, 'owner-b', 'one', async () => { throw new Error('must not run'); }), (e: unknown) => e instanceof ApiError && e.code === 'not-owner');
  assert.equal(await cleanupDeletedAvatar(db!, 'owner-a', 'one', async p => { assert.equal(p, path); }), true);
  assert.equal((await db!.doc('androidAvatarCleanup/one').get()).exists, false);
});
