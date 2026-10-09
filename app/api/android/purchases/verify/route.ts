import { apiFailure, authenticate, json, rateLimit, readJson } from '@/app/lib/android/admin';
import { parseProofs, verifyAccountPurchases } from '@/app/lib/android/purchases';

export async function POST(request: Request) {
  try {
    const uid = await authenticate(request);
    await rateLimit(uid);
    return json(await verifyAccountPurchases(uid, parseProofs(await readJson(request))));
  } catch (error) { return apiFailure(error); }
}
