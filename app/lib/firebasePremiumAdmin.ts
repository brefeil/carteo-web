import { createSign } from "node:crypto";

/** Dedicated Firebase Admin credentials; only server-side code may import this module. */
function account() {
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing Firebase admin service account");
  const value = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
  if (value.project_id !== "carteo-d0fa9" || !value.client_email || !value.private_key) throw new Error("Invalid Firebase admin service account");
  return value;
}
function encode(value: unknown) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
async function oauth(scope: string) {
  const a = account(); const now = Math.floor(Date.now() / 1000);
  const unsigned = encode({ alg: "RS256", typ: "JWT" }) + "." + encode({ iss: a.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 1800 });
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end();
  const assertion = unsigned + "." + signer.sign(a.private_key!.replace(/\\n/g, "\n")).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), cache: "no-store" });
  if (!response.ok) throw new Error("Firebase OAuth failed: " + response.status);
  const result = await response.json() as { access_token?: string };
  if (!result.access_token) throw new Error("Missing Firebase access token");
  return result.access_token;
}
export async function verifyFirebaseUser(idToken: string): Promise<string> {
  if (!idToken || idToken.length > 8192) throw new Error("Invalid ID token");
  const token = await oauth("https://www.googleapis.com/auth/identitytoolkit");
  const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup", { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ idToken }), cache: "no-store" });
  if (!response.ok) throw new Error("Firebase ID token rejected");
  const result = await response.json() as { users?: Array<{ localId?: string; disabled?: boolean }> };
  const user = result.users?.[0];
  if (!user?.localId || user.disabled) throw new Error("Firebase user not found");
  return user.localId;
}
export async function firestoreAdminAccessToken() { return oauth("https://www.googleapis.com/auth/datastore"); }
export const firestoreDocumentsBase = "https://firestore.googleapis.com/v1/projects/carteo-d0fa9/databases/(default)/documents";
