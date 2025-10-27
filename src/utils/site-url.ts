// src/utils/site-url.ts
/** 返回带协议且合法的站点 URL（优先 NEXT_PUBLIC_SITE_URL），本地回退到 http://localhost:3000 */
export function getSiteUrl(): string {
  const isDev = process.env.NODE_ENV !== "production";
  const rawenv =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "";

  if (isDev) {
    if (!rawenv) return "http://localhost:3000";
    try {
      // 如果填写了 dev 域名（含协议）就直接使用
      const url = new URL(rawenv.trim());
      return url.toString();
    } catch (err) {
      return "http://localhost:3000";
    }
  }

  const raw = rawenv.trim();
  if (!raw) return "https://pdf-translation.com";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}
