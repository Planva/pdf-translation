// src/app/(dashboard)/dashboard/settings/settings-sidebar.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  User,
  Shield,
  MonitorSmartphone,
  KeyRound,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import useSignOut from "@/hooks/useSignOut";

const NAV = [
  { href: "/dashboard/settings", icon: User, label: "Profile" },
  { href: "/dashboard/settings/security", icon: Shield, label: "Security" },
  { href: "/dashboard/settings/sessions", icon: MonitorSmartphone, label: "Sessions" },
  { href: "/dashboard/settings/change-password", icon: KeyRound, label: "Change Password" },
] as const;

export function SettingsSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useSignOut();
  const [busy, setBusy] = React.useState(false);

  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();            // 清理会话/ Cookie 等（你的后端 action 内已处理）
    } finally {
      // 在 Workers 环境下，显式导航最稳妥
      router.push("/sign-in");
      setBusy(false);
    }
  };

  return (
    <nav
      className="space-y-1"
      aria-label="Settings navigation"
    >
      {NAV.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}

      <div className="pt-2">
        <Button
          variant="destructive"
          className="w-full"
          type="button"
          onClick={handleSignOut}
          disabled={busy}
          aria-busy={busy}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          {busy ? "Signing out..." : "Sign out"}
        </Button>
      </div>
    </nav>
  );
}

export default SettingsSidebar;
