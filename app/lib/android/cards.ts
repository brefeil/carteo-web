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
