import { apiFailure, authenticate, androidDb, json, rateLimit, readJson } from '@/app/lib/android/admin';
import { saveAndroidCard } from '@/app/lib/android/cards';
import { verifyAccountPurchases } from '@/app/lib/android/purchases';

export async function GET(request: Request) {
  try {
    const uid = await authenticate(request);
    await rateLimit(uid);
    const snapshot = await androidDb().collection('profiles').where('ownerUID', '==', uid).get();
    return json({ cards: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, slug: doc.id })) });
  } catch (error) { return apiFailure(error); }
}
export async function POST(request: Request) {
  try {
    const uid = await authenticate(request);
    await rateLimit(uid);
    const input = await readJson(request);
    const entitlement = await verifyAccountPurchases(uid);
    const card = await saveAndroidCard(androidDb(), uid, input, entitlement.premium);
    return json({ card });
  } catch (error) { return apiFailure(error); }
}
