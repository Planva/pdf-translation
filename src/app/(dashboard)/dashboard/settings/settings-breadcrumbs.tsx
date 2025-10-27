"use client";
import { PageHeader } from "@/components/page-header";

export function SettingsBreadcrumbs() {
  return (
    <PageHeader
      showSidebarTrigger={false}
      items={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/settings", label: "Settings" },
        { href: "/dashboard/settings", label: "Overview" },
      ]}
    />
  );
}
