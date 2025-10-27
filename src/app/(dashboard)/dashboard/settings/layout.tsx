import { getSessionFromCookie } from "@/utils/auth";
import { redirect } from "next/navigation";
import { SettingsSidebar } from "./settings-sidebar";
import { SettingsBreadcrumbs } from "./settings-breadcrumbs";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionFromCookie();
  if (!session) redirect("/sign-in");

  // 顶部面包屑（不再放折叠按钮，折叠按钮由 (dashboard)/layout.tsx 统一提供）
  return (
    <>
      <SettingsBreadcrumbs />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
          <aside className="lg:w-1/5">
            <SettingsSidebar />
          </aside>
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </>
  );
}
