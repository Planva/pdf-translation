// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { FEATURES } from "@/config/features";

// ✅ 增加 sign-in，使回跳页也走域名收敛 + no-store
export const config = { matcher: ["/sign-in", "/dashboard", "/dashboard/:path*"] };

// 规范化落地路由（保持你原逻辑）
function normalizeLanding(raw?: string) {
  const v = (raw ?? "/dashboard/billing").trim();
  return v.startsWith("/") ? v : `/${v.replace(/^\/+/, "")}`;
}

function isAllowed(pathname: string) {
  if (pathname === "/dashboard") return FEATURES.HOME;
  if (pathname.startsWith("/dashboard/teams")) return FEATURES.TEAMS;
  if (pathname.startsWith("/dashboard/marketplace")) return FEATURES.MARKETPLACE;
  if (pathname.startsWith("/dashboard/billing")) return FEATURES.BILLING;
  if (pathname.startsWith("/dashboard/settings")) return FEATURES.SETTINGS;
  return true;
}

function firstEnabledLanding(): string | null {
  if (FEATURES.BILLING) return "/dashboard/billing";
  if (FEATURES.SETTINGS) return "/dashboard/settings";
  if (FEATURES.TEAMS) return "/dashboard/teams";
  if (FEATURES.MARKETPLACE) return "/dashboard/marketplace";
  return null;
}

// ✅ 新增：域名收敛（把 www. 重定向到 apex 或与你 NEXT_PUBLIC_SITE_URL 一致）
function withCanonicalHost(req: NextRequest): NextResponse | null {
  const url = new URL(req.url);
  const wanted = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!wanted) return null;

  const curr = url.host;
  if (curr !== wanted) {
    url.host = wanted;
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }
  return null;
}

// ✅ 保留：仅对 HTML/RSC 加 no-store，避免旧 chunk
function withNoStore(req: NextRequest, res: NextResponse) {
  if (req.method !== "GET") return res;
  const accept = req.headers.get("accept") || "";
  if (accept.includes("text/html") || accept.includes("text/x-component")) {
    res.headers.set("Cache-Control", "no-store");
  }
  return res;
}

export function middleware(req: NextRequest) {
  // 先做域名收敛（含 /sign-in 与 /dashboard*）
  const canon = withCanonicalHost(req);
  if (canon) return canon;

  const { pathname } = req.nextUrl;

  if (pathname === "/dashboard") {
    if (FEATURES.HOME === false) {
      const envLanding = normalizeLanding(process.env.DASHBOARD_HOME_ROUTE);
      const target = isAllowed(envLanding) ? envLanding : firstEnabledLanding();
      if (target) return withNoStore(req, NextResponse.redirect(new URL(target, req.url)));
      return withNoStore(req, new NextResponse("Not Found", { status: 404 }));
    }
    return withNoStore(req, NextResponse.next());
  }

  if (pathname.startsWith("/dashboard")) {
    if (!isAllowed(pathname)) {
      return withNoStore(req, new NextResponse("Not Found", { status: 404 }));
    }
    return withNoStore(req, NextResponse.next());
  }

  // /sign-in 直接 no-store 放行（减少陈旧 RSC）
  if (pathname === "/sign-in") {
    return withNoStore(req, NextResponse.next());
  }

  return NextResponse.next();
}
