import { createHash } from 'node:crypto';
import { androidDb } from './admin';
import { ApiError } from './policy';
import { verifyGooglePlayPurchase } from '../googlePlayVerifier';

export type Proof = { productId: string; purchaseToken: string };
export function parseProofs(input: unknown): Proof[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'invalid-proofs');
  const obj = input as Record<string, unknown>;
  if (Object.keys(obj).some(key => key !== 'proofs') || !Array.isArray(obj.proofs) || obj.proofs.length > 10) throw new ApiError(400, 'invalid-proofs');
  return obj.proofs.map(proof => {
    if (!proof || typeof proof !== 'object' || Array.isArray(proof)) throw new ApiError(400, 'invalid-proof');
    const p = proof as Record<string, unknown>;
    if (Object.keys(p).some(k => !['productId', 'purchaseToken'].includes(k)) ||
      !['carteo_premium_monthly', 'carteo_premium_yearly', 'carteo_premium_lifetime_299'].includes(String(p.productId)) ||
      typeof p.purchaseToken !== 'string' || !p.purchaseToken || p.purchaseToken.length > 4096) throw new ApiError(400, 'invalid-proof');
    return { productId: String(p.productId), purchaseToken: p.purchaseToken };
  });
}
function key(token: string) { return createHash('sha256').update(`google:${token}`).digest('hex'); }
export async function verifyAccountPurchases(uid: string, submitted: Proof[] = []) {
  if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_PLAY_PACKAGE_NAME !== 'cloud.carteo.connect') {
    throw new ApiError(503, 'play-not-configured');
  }
  const db = androidDb();
  const saved = await db.collection('androidPlayPurchases').where('ownerUID', '==', uid).limit(20).get();
  const proofs = new Map<string, Proof>();
  for (const doc of saved.docs) {
    const p = doc.data();
    if (typeof p.productId === 'string' && typeof p.purchaseToken === 'string') proofs.set(key(p.purchaseToken), p as Proof);
  }
  for (const proof of submitted) proofs.set(key(proof.purchaseToken), proof);
  const verifiedTokens: string[] = [];
  let validUntilMs = 0;
  for (const [id, proof] of proofs) {
    // Every grant AND every premium write rechecks Google. Stored booleans
    // and client-supplied entitlement fields never grant access.
    const verified = await verifyGooglePlayPurchase(uid, proof.productId, proof.purchaseToken);
    if (!verified) continue;
    const ref = db.collection('androidPlayPurchases').doc(id);
    await db.runTransaction(async tx => {
      const existing = await tx.get(ref);
      if (existing.exists && existing.get('ownerUID') !== uid) throw new ApiError(403, 'purchase-owner-mismatch');
      tx.set(ref, { ...proof, ownerUID: uid, verifiedAt: new Date().toISOString() });
    });
    verifiedTokens.push(proof.purchaseToken);
    validUntilMs = Math.max(validUntilMs, Math.min(Date.now() + 5 * 60_000, verified.expiresAt ? Date.parse(verified.expiresAt) : Infinity));
  }
  return { premium: verifiedTokens.length > 0, validUntilMs, verifiedTokens };
}
