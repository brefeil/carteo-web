import type { Firestore } from 'firebase-admin/firestore';
import { ApiError, assertCardWrite, parseCard, profileFields } from './policy';

export async function saveAndroidCard(db: Firestore, uid: string, input: unknown, premium: boolean) {
  const card = parseCard(input, premium, uid);
  const ref = db.collection('profiles').doc(card.publicSlug);
  const account = db.collection('androidCardAccounts').doc(uid);
  return db.runTransaction(async tx => {
    // All reads precede writes. The account document serializes simultaneous
    // requests, including two different slugs on an initially empty account.
    const accountSnap = await tx.get(account);
    const profile = await tx.get(ref);
    const deleted = await tx.get(db.collection('androidDeletedCards').doc(card.publicSlug));
    if (deleted.exists) throw new ApiError(409, 'retired-slug');
    const owned = await tx.get(db.collection('profiles').where('ownerUID', '==', uid));
    const slugs = owned.docs.map(doc => doc.id);
    assertCardWrite(profile.data(), uid, card.publicSlug, slugs, premium);
    let primarySlug: unknown = accountSnap.get('primarySlug');
    if (!primarySlug) {
      if (slugs.length > 1) throw new ApiError(409, 'primary-migration-required');
      primarySlug = slugs[0] || card.publicSlug;
    }
    if (typeof primarySlug !== 'string') throw new ApiError(409, 'primary-migration-required');
    if (!premium && primarySlug !== card.publicSlug) throw new ApiError(403, 'secondary-card-requires-premium');
    const data = { ...profileFields(card, uid), isPrimary: primarySlug === card.publicSlug,
      // Existing disabled cards must not be silently reactivated by editing.
      isActive: profile.exists ? profile.get('isActive') !== false : true,
      updatedAt: new Date().toISOString() };
    tx.set(account, { primarySlug, updatedAt: data.updatedAt }, { merge: true });
    tx.set(ref, data, { merge: true });
    return { ...data, id: ref.id };
  });
}

// A deleted public URL must never identify a different person in an old QR.
// The private tombstone contains no card content. Deletion does not require
// Premium or a working Play API, including after a subscription has expired.
export async function deleteAndroidCard(db: Firestore, uid: string, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'invalid-delete');
  const value = input as Record<string, unknown>;
  const slug = value.publicSlug;
  if (Object.keys(value).some(k => k !== 'publicSlug') || typeof slug !== 'string' ||
      slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ApiError(400, 'invalid-delete');
  const account = db.collection('androidCardAccounts').doc(uid);
  const ref = db.collection('profiles').doc(slug);
  const tombstone = db.collection('androidDeletedCards').doc(slug);
  return db.runTransaction(async tx => {
    const accountSnap = await tx.get(account);
    const profile = await tx.get(ref);
    const deleted = await tx.get(tombstone);
    if (!profile.exists) {
      if (deleted.get('ownerUID') === uid) return { deleted: true, publicSlug: slug };
      throw new ApiError(404, 'card-not-found');
    }
    if (profile.get('ownerUID') !== uid) throw new ApiError(403, 'not-owner');
    if (profile.get('schemaVersion') !== 3) throw new ApiError(409, 'migration-required');
    const owned = await tx.get(db.collection('profiles').where('ownerUID', '==', uid));
    const remaining = owned.docs.filter(doc => doc.id !== slug);
    if (remaining.length > 400) throw new ApiError(409, 'account-maintenance-required');
    // Never silently promote legacy iOS data into the managed lifecycle.
    if (remaining.some(doc => doc.get('schemaVersion') !== 3)) throw new ApiError(409, 'primary-migration-required');
    const oldPrimary = accountSnap.get('primarySlug');
    const next = remaining.find(doc => doc.id === oldPrimary) ||
      remaining.filter(doc => doc.get('isActive') !== false).sort((a, b) => a.id.localeCompare(b.id))[0] ||
      remaining.sort((a, b) => a.id.localeCompare(b.id))[0];
    const updatedAt = new Date().toISOString();
    tx.set(account, { primarySlug: next?.id ?? null, updatedAt }, { merge: true });
    for (const doc of remaining) {
      if (doc.get('isPrimary') !== (doc.id === next?.id)) tx.update(doc.ref, { isPrimary: doc.id === next?.id, updatedAt });
    }
    tx.set(tombstone, { ownerUID: uid, deletedAt: updatedAt });
    // Queue only the fixed owner-scoped object, never an arbitrary avatar URL.
    tx.set(db.collection('androidAvatarCleanup').doc(slug), {
      ownerUID: uid, objectPath: `avatars/${uid}/${slug}.jpg`, state: 'pending', createdAt: updatedAt,
    });
    tx.delete(ref);
    return { deleted: true, publicSlug: slug };
  });
}

export async function cleanupDeletedAvatar(db: Firestore, uid: string, slug: string,
  erase: (objectPath: string) => Promise<unknown>): Promise<boolean> {
  const ref = db.collection('androidAvatarCleanup').doc(slug);
  const pending = await ref.get();
  if (!pending.exists) return true;
  if (pending.get('ownerUID') !== uid) throw new ApiError(403, 'not-owner');
  try {
    // Ignore any stored URL/path. Only erase this account's exact card image.
    await erase(`avatars/${uid}/${slug}.jpg`);
    await ref.delete();
    return true;
  } catch {
    // Retain the work item for a retry; do not resurrect the deleted profile.
    return false;
  }
}
