// src/utils/site-url.ts
/** 返回带协议且合法的站点 URL（优先 NEXT_PUBLIC_SITE_URL），本地回退到 http://localhost:3000 */
export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "";

  if (!raw) return "http://localhost:3000";
  // 已包含协议直接返回
  if (/^https?:\/\//i.test(raw)) return raw.trim();
  // 只有域名时补 https://
  return `https://${raw.trim()}`;
}
