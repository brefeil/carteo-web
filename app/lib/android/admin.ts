import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { ApiError } from './policy';

export function androidAdmin() {
  const existing = getApps().find(app => app.name === 'carteo-android-api');
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new ApiError(503, 'server-not-configured');
  const credentials = JSON.parse(raw);
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId || credentials.project_id !== projectId) throw new ApiError(503, 'server-not-configured');
  return initializeApp({ credential: cert(credentials), projectId }, 'carteo-android-api');
}
export function androidDb() { return getFirestore(androidAdmin()); }
export async function authenticate(request: Request): Promise<string> {
  if (process.env.ANDROID_API_ENABLED !== 'true') throw new ApiError(404, 'not-found');
  const bearer = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._-]{1,8192})$/)?.[1];
  if (!bearer) throw new ApiError(401, 'authentication-required');
  const auth = getAuth(androidAdmin());
  try {
    const token = await auth.verifyIdToken(bearer, true);
    if (token.firebase.sign_in_provider === 'anonymous') throw new Error();
    return token.uid;
  } catch { throw new ApiError(401, 'authentication-required'); }
}
export async function rateLimit(uid: string) {
  const ref = androidDb().collection('androidApiRateLimits').doc(createHash('sha256').update(uid).digest('hex'));
  const minute = Math.floor(Date.now() / 60000);
  await androidDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const count = snap.get('minute') === minute ? Number(snap.get('count') || 0) : 0;
    if (count >= 30) throw new ApiError(429, 'too-many-requests');
    tx.set(ref, { minute, count: count + 1 });
  });
}
export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'json-required');
  if (!request.body) throw new ApiError(400, 'missing-body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) { await reader.cancel(); throw new ApiError(413, 'body-too-large'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'invalid-json');
  } finally { reader.releaseLock(); }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Authorization' } });
}
export function apiFailure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.code }, error.status);
  // Do not log tokens, purchase payloads, profiles or raw provider errors.
  console.error('android-api-operation-failed');
  return json({ error: 'service-unavailable' }, 503);
}
