export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export const SOCIALS = ['linkedin', 'instagram', 'tiktok', 'snapchat', 'facebook', 'youtube', 'x'] as const;
const hosts: Record<string, string[]> = {
  linkedin: ['linkedin.com'], instagram: ['instagram.com', 'instagr.am'],
  tiktok: ['tiktok.com'], snapchat: ['snapchat.com'], facebook: ['facebook.com', 'fb.com', 'fb.me'],
  youtube: ['youtube.com', 'youtu.be'], x: ['x.com', 'twitter.com'],
};
const fields = ['firstName', 'lastName', 'company', 'jobTitle', 'phone', 'email', 'website', 'bio', 'avatarUrl', ...SOCIALS, 'publicSlug', 'theme'] as const;
export type CardInput = Record<typeof fields[number], string>;
function host(value: string): string {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch { throw new ApiError(400, 'invalid-url'); }
}
function belongsTo(value: string, allowed: string[]): boolean {
  return allowed.some(domain => value === domain || value.endsWith(`.${domain}`));
}
export function parseCard(input: unknown, premium: boolean, uid: string): CardInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'invalid-card');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !fields.includes(key as typeof fields[number]))) throw new ApiError(400, 'unknown-card-field');
  const result = {} as CardInput;
  for (const field of fields) {
    const v = value[field] ?? (field === 'theme' ? 'blue' : '');
    if (typeof v !== 'string' || v.length > (field === 'bio' ? 4000 : 2048)) throw new ApiError(400, 'invalid-card-field');
    result[field] = v.trim();
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.publicSlug) || result.publicSlug.length > 100) throw new ApiError(400, 'invalid-slug');
  if (!result.firstName && !result.lastName) throw new ApiError(400, 'missing-name');
  if (!['blue', 'mint', 'sunset', 'gold', 'dark'].includes(result.theme)) throw new ApiError(400, 'invalid-theme');
  if (!premium && !['blue', 'mint'].includes(result.theme)) throw new ApiError(403, 'premium-theme');
  if (!premium && SOCIALS.filter(field => result[field]).length > 1) throw new ApiError(403, 'free-social-limit');
  for (const field of SOCIALS) {
    const v = result[field];
    if (!v) continue;
    if (field !== 'linkedin' && /^@?[A-Za-z0-9_-]+$/.test(v)) continue;
    if (!belongsTo(host(v), hosts[field])) throw new ApiError(400, 'invalid-social');
  }
  if (result.website && belongsTo(host(result.website), Object.values(hosts).flat())) throw new ApiError(400, 'social-in-website');
  if (result.avatarUrl) {
    let url: URL;
    try { url = new URL(result.avatarUrl); } catch { throw new ApiError(400, 'invalid-avatar'); }
    const bucket = process.env.FIREBASE_STORAGE_BUCKET;
    const expectedPath = `/v0/b/${bucket}/o/${encodeURIComponent(`avatars/${uid}/${result.publicSlug}.jpg`)}`;
    if (!bucket || url.protocol !== 'https:' || url.hostname !== 'firebasestorage.googleapis.com' || url.username || url.password || url.pathname !== expectedPath) {
      throw new ApiError(400, 'invalid-avatar');
    }
  }
  return result;
}
export function assertCardWrite(existing: Record<string, unknown> | undefined, uid: string, slug: string, ownedSlugs: string[], premium: boolean) {
  if (existing && existing.ownerUID !== uid) throw new ApiError(403, 'not-owner');
  if (existing && (typeof existing.schemaVersion !== 'number' || existing.schemaVersion < 2)) throw new ApiError(409, 'migration-required');
  if (!existing && !premium && ownedSlugs.some(id => id !== slug)) throw new ApiError(403, 'free-card-limit');
}
export function profileFields(card: CardInput, uid: string) {
  const { publicSlug, jobTitle, avatarUrl, ...rest } = card;
  return { ...rest, name: [card.firstName, card.lastName].filter(Boolean).join(' '), title: jobTitle,
    avatar: avatarUrl, slug: publicSlug, ownerUID: uid, schemaVersion: 3 };
}
