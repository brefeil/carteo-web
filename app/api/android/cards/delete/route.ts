import { getStorage } from 'firebase-admin/storage';
import { apiFailure, authenticate, androidAdmin, androidDb, json, rateLimit, readJson } from '@/app/lib/android/admin';
import { cleanupDeletedAvatar, deleteAndroidCard } from '@/app/lib/android/cards';

export async function POST(request: Request) {
  try {
    const uid = await authenticate(request);
    await rateLimit(uid);
    const db = androidDb();
    const result = await deleteAndroidCard(db, uid, await readJson(request));
    const avatarRemoved = await cleanupDeletedAvatar(db, uid, result.publicSlug, async path => {
      const bucket = process.env.FIREBASE_STORAGE_BUCKET;
      if (!bucket) throw new Error('storage-not-configured');
      await getStorage(androidAdmin()).bucket(bucket).file(path).delete({ ignoreNotFound: true });
    });
    return json({ ...result, avatarCleanupPending: !avatarRemoved });
  } catch (error) { return apiFailure(error); }
}
