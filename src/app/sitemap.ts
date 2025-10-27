import { getSiteUrl } from "@/utils/site-url";

export default async function sitemap() {
  const site = getSiteUrl();
  const now = new Date();
  return [
    { url: site, lastModified: now },
    { url: `${site}/price`, lastModified: now },
    // 需要的话再加别的路径
  ];
}
