// src/config/dashboard-home.ts
export function getDashboardHomeConfig() {
    const useBuiltInHome = process.env.FEATURE_DASHBOARD_HOME !== "false";
    // 兜底到 /dashboard/billing，且保证是以 / 开头的相对路径
    const landingRaw = process.env.DASHBOARD_HOME_ROUTE || "/dashboard/billing";
    const landing =
      landingRaw.startsWith("/") ? landingRaw : `/${landingRaw.replace(/^\/+/, "")}`;
  
    return { useBuiltInHome, landing };
  }
  