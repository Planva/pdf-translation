import { getSiteUrl } from "@/utils/site-url";

export default function robots() {
  const site = getSiteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
