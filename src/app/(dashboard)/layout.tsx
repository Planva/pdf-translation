import { getSessionFromCookie } from "@/utils/auth";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { FEATURES } from "@/config/features"; // ← 仍然在服务端读取
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionFromCookie();
  if (!session) redirect("/sign-in");

  return (
    <SidebarProvider>
      <AppSidebar featureFlags={FEATURES} /> {/* ← 传入服务端读取的 flags */}
      <SidebarInset className="w-full flex flex-col">{children}</SidebarInset>
    </SidebarProvider>
  );
}
