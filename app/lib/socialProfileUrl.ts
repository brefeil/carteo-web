const hosts: Record<string, string[]> = {
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  snapchat: ["snapchat.com"],
  facebook: ["facebook.com"],
  linkedin: ["linkedin.com"],
  youtube: ["youtube.com", "youtu.be"],
  x: ["x.com", "twitter.com"],
};

export function socialProfileUrl(platform: string, raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim();
  const allowed = hosts[platform];
  if (!allowed) return null;
  const looksLikeUrl = /^(https?:\/\/|www\.)/i.test(value) ||
    allowed.some(host => value.toLowerCase().startsWith(host + "/"));
  if (looksLikeUrl) {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : "https://" + value);
      if (url.protocol !== "https:" || url.username || url.password) return null;
      if (!allowed.some(host => url.hostname.toLowerCase() === host || url.hostname.toLowerCase() === "www." + host)) return null;
      return url.toString();
    } catch { return null; }
  }
  const handle = value.replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]+$/.test(handle)) return null;
  const prefix = platform === "linkedin" ? "in/" :
    platform === "snapchat" ? "add/" :
    platform === "tiktok" || platform === "youtube" ? "@" : "";
  return "https://" + allowed[0] + "/" + prefix + handle;
}
