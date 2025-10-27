// src/app/(dashboard)/dashboard/settings/settings.actions.ts
"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { userTable } from "@/db/schema";
import { requireVerifiedEmail, getSessionFromCookie, deleteSessionTokenCookie, invalidateSession } from "@/utils/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { userSettingsSchema } from "@/schemas/settings.schema";
import { updateAllSessionsOfUser } from "@/utils/kv-session";
import { withRateLimit, RATE_LIMITS } from "@/utils/with-rate-limit";
import { redirect } from "next/navigation";

// 个人资料更新（原样保留）
export const updateUserProfileAction = createServerAction()
  .input(userSettingsSchema)
  .handler(async ({ input }) => {
    return withRateLimit(
      async () => {
        const session = await requireVerifiedEmail();
        const db = getDB();

        if (!session?.user?.id) {
          throw new ZSAError("NOT_AUTHORIZED", "Unauthorized");
        }

        try {
          await db
            .update(userTable)
            .set({ ...input })
            .where(eq(userTable.id, session.user.id));

          await updateAllSessionsOfUser(session.user.id);
          // 注意：settings 路由已经迁移到 /dashboard 下
          revalidatePath("/dashboard/settings");
          return { success: true };
        } catch (error) {
          console.error(error);
          throw new ZSAError(
            "INTERNAL_SERVER_ERROR",
            "Failed to update profile"
          );
        }
      },
      RATE_LIMITS.SETTINGS
    );
  });

/**
 * ✅ 登出：删除 KV 会话 + 删除浏览器 Cookie，然后重定向到 /sign-in
 * - 和你的 <form action={signOutAction}> 配合使用
 * - 不做 RateLimit（退出不需要限流）
 */
export const signOutAction = createServerAction()
  .handler(async () => {
    const session = await getSessionFromCookie();

    try {
      // 有 KV 会话就顺手删掉，避免残留
      if (session?.sessionId && session?.user?.id) {
        await invalidateSession(session.sessionId, String(session.user.id));
      }
    } catch (err) {
      // 忽略后端删除异常，保证后续仍能删 Cookie 并跳转
      console.warn("invalidateSession failed:", err);
    }

    // 关键：删掉浏览器里的会话 Cookie
    await deleteSessionTokenCookie();

    // 立即跳转到登录页（也可改成 redirect("/")）
    redirect("/sign-in");
  });
