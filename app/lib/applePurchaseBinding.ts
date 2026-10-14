import { firestoreAdminAccessToken, firestoreDocumentsBase } from "./firebasePremiumAdmin";

/** A transaction belongs to exactly one Firebase UID. Uses Firestore create-only
 * semantics: a second user cannot claim the same original Apple transaction.
 * The caller MUST first verify the transaction with Apple's official verifier.
 */
export async function bindVerifiedAppleTransaction(originalTransactionId: string, uid: string): Promise<void> {
  if (!/^\d{6,30}$/.test(originalTransactionId) || !/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) throw new Error("Invalid binding identifiers");
  const token = await firestoreAdminAccessToken();
  const url = firestoreDocumentsBase + "/applePurchaseBindings?documentId=" + encodeURIComponent(originalTransactionId);
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ fields: { uid: { stringValue: uid }, originalTransactionId: { stringValue: originalTransactionId }, createdAt: { timestampValue: new Date().toISOString() } } }),
    cache: "no-store",
  });
  if (response.ok) return;
  // Existing binding is acceptable only when it belongs to this same UID.
  if (response.status === 409) {
    const existing = await lookupAppleTransactionOwner(originalTransactionId);
    if (existing === uid) return;
    throw new Error("Apple transaction already belongs to another account");
  }
  throw new Error("Could not bind Apple transaction: " + response.status);
}
export async function lookupAppleTransactionOwner(originalTransactionId: string): Promise<string | null> {
  if (!/^\d{6,30}$/.test(originalTransactionId)) throw new Error("Invalid Apple transaction ID");
  const token = await firestoreAdminAccessToken();
  const response = await fetch(firestoreDocumentsBase + "/applePurchaseBindings/" + encodeURIComponent(originalTransactionId), { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Apple binding lookup failed: " + response.status);
  const document = await response.json() as { fields?: { uid?: { stringValue?: string } } };
  return document.fields?.uid?.stringValue ?? null;
}
