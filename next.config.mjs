// next.config.mjs
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// ✅ 本地开发必须初始化（对生产没副作用）
initOpenNextCloudflareForDev();

const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
  // 这些选项你可以按需保留/删除
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
