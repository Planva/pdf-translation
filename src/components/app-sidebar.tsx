"use client";

import { useEffect, useState, type ComponentType } from "react";
import type { Route } from "next";
import {
  Building2,
  SquareTerminal,
  Users,
  ShoppingCart,
  CreditCard,
  Settings2,
  Languages,
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useSessionStore } from "@/state/session";
import Link from "next/link";
import { Home /* 或 Globe, ArrowLeft */ } from "lucide-react";
type FeatureFlags = {
  HOME: boolean;
  TRANSLATIONS: boolean;
  TEAMS: boolean;
  MARKETPLACE: boolean;
  BILLING: boolean;
  SETTINGS: boolean;
};

export type NavItem = {
  title: string;
  url: Route;
  icon?: ComponentType<any>;
};
export type NavMainItem = NavItem & { isActive?: boolean; items?: NavItem[] };

type Data = {
  teams: { name: string; logo: ComponentType<any>; plan: string }[];
};

type Props = React.ComponentProps<typeof Sidebar> & {
  featureFlags: FeatureFlags; // ← 新增
};

export function AppSidebar({ featureFlags, ...sidebarProps }: Props) {
  const { session } = useSessionStore();
  const [formattedTeams, setFormattedTeams] = useState<Data["teams"]>([]);

  useEffect(() => {
    if (session?.teams?.length) {
      setFormattedTeams(
        session.teams.map((t) => ({
          name: t.name,
          logo: Building2,
          plan: t.role.name || "Member",
        }))
      );
    }
  }, [session]);

  const navMain: NavMainItem[] = [
    ...(featureFlags.HOME
      ? [{ title: "Dashboard", url: "/dashboard" as Route, icon: SquareTerminal }]
      : []),
    ...(featureFlags.TRANSLATIONS
      ? [{ title: "Translations", url: "/dashboard/translations" as Route, icon: Languages }]
      : []),
    ...(featureFlags.TEAMS
      ? [{ title: "Teams", url: "/dashboard/teams" as Route, icon: Users }]
      : []),
    ...(featureFlags.MARKETPLACE
      ? [{ title: "Marketplace", url: "/dashboard/marketplace" as Route, icon: ShoppingCart }]
      : []),
    ...(featureFlags.BILLING
      ? [{ title: "Billing", url: "/dashboard/billing" as Route, icon: CreditCard }]
      : []),
    ...(featureFlags.SETTINGS
      ? [{ title: "Settings", url: "/dashboard/settings" as Route, icon: Settings2 }]
      : []),
  ];

  return (
    <Sidebar collapsible="icon" {...sidebarProps}>
      {/* ① 总是渲染 Header；把“返回主页”放在最上方 */}
      <SidebarHeader>
        <div className="px-2 pt-2">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <Home className="h-4 w-4" />
            <span className="truncate">Back to site</span>
          </Link>
        </div>

        {/* ② 保留原来的 TeamSwitcher（有团队时显示） */}
        {formattedTeams.length > 0 && (
          <div className="px-2 pb-2">
            <TeamSwitcher teams={formattedTeams} />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
