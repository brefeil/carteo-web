import { firestoreAdminAccessToken, firestoreDocumentsBase } from "./firebasePremiumAdmin";
import type { ApplePremiumDecision } from "./applePremiumDecision";

type FirestoreValue = { stringValue?: string; booleanValue?: boolean; mapValue?: { fields?: Record<string, FirestoreValue> } };
type FirestoreDocument = { name?: string; fields?: Record<string, FirestoreValue> };
const base = firestoreDocumentsBase;
const headers = (token: string) => ({ Authorization: "Bearer " + token, "content-type": "application/json" });

/** Only call with an Apple-verified transaction and a server-verified Firebase UID. */
export async function projectApplePremiumToOwnerCards(input: {
  uid: string;
  originalTransactionId: string;
  transactionId: string;
  productId: string;
  decision: ApplePremiumDecision;
  eventTime?: number;
}): Promise<number> {
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(input.uid) || !/^\d{6,30}$/.test(input.originalTransactionId)) throw new Error("invalid-apple-projection");
  const token = await firestoreAdminAccessToken();
  const query = await fetch(base + ":runQuery", {
    method: "POST", headers: headers(token), cache: "no-store",
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "profiles" }],
      where: { fieldFilter: { field: { fieldPath: "ownerUID" }, op: "EQUAL", value: { stringValue: input.uid } } }
    } }),
  });
  if (!query.ok) throw new Error("owner-cards-query-failed-" + query.status);
  const rows = await query.json() as Array<{ document?: FirestoreDocument }>;
  const cards = rows.map(r => r.document).filter((d): d is FirestoreDocument => Boolean(d?.name));
  const status = input.decision.status;
  const eventTime = input.eventTime ?? Date.now();
  if (!Number.isFinite(eventTime)) throw new Error("invalid-apple-event-time");
  let updated = 0;
  for (const card of cards) {
    const previous = card.fields?.premiumEntitlement?.mapValue?.fields;
    // Never overwrite a different account's administrative gift or Google subscription.
    if (previous?.verificationStatus?.stringValue === "verified" &&
        previous?.source?.stringValue !== "apple") continue;
    // Do not overwrite an entitlement belonging to a different Apple subscription.
    if (previous?.source?.stringValue === "apple" && previous?.originalTransactionId?.stringValue && previous.originalTransactionId.stringValue !== input.originalTransactionId) continue;
    const previousEvent = Date.parse(previous?.eventAt?.stringValue ?? "");
    if (Number.isFinite(previousEvent) && previousEvent > eventTime) continue;
    const entitlement: Record<string, FirestoreValue | { nullValue: null }> = {
      verificationStatus: { stringValue: "verified" },
      source: { stringValue: "apple" },
      status: { stringValue: status },
      lifetime: { booleanValue: input.decision.lifetime },
      originalTransactionId: { stringValue: input.originalTransactionId },
      transactionId: { stringValue: input.transactionId },
      productId: { stringValue: input.productId },
      eventAt: { stringValue: new Date(eventTime).toISOString() },
    };
    entitlement.expiresAt = input.decision.expiresAt ? { stringValue: input.decision.expiresAt } : { nullValue: null };
    const url = "https://firestore.googleapis.com/v1/" + card.name +
      "?updateMask.fieldPaths=premiumEntitlement&currentDocument.exists=true";
    const response = await fetch(url, {
      method: "PATCH", headers: headers(token), cache: "no-store",
      body: JSON.stringify({ fields: { premiumEntitlement: { mapValue: { fields: entitlement } } } }),
    });
    if (!response.ok) throw new Error("owner-card-projection-failed-" + response.status);
    updated++;
  }
  return updated;
}
