// src/app/(dashboard)/dashboard/billing/subscription.server.ts
'use server';

import { getSessionFromCookie } from "@/utils/auth";
import { getDB } from "@/db";
import { userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

/** UI 层用到的订阅状态（与你页面一致） */
export type UiSubscription =
  | { code: "none" }
  | { code: "monthly" }
  | { code: "yearly" }
  | { code: "canceled"; until: Date };

/* -------------------- 小工具：稳健地取一条记录 -------------------- */
async function getOne<T>(qb: any): Promise<T | undefined> {
  if (!qb) return undefined;

  // 1) .get()
  try {
    if (typeof qb.get === "function") {
      const row = await qb.get();
      if (row !== undefined && row !== null) return row as T;
    }
  } catch {
    // 忽略，继续回退
  }

  // 2) .all()
  try {
    if (typeof qb.all === "function") {
      const rows = await qb.all();
      if (Array.isArray(rows) && rows.length) return rows[0] as T;
    }
  } catch {
    // 忽略，继续回退
  }

  // 3) .execute()
  try {
    if (typeof qb.execute === "function") {
      const res = await qb.execute();
      if (Array.isArray(res) && res.length) return res[0] as T;
      if (res && typeof res === "object" && "rows" in res && Array.isArray((res as any).rows)) {
        const rows = (res as any).rows;
        if (rows.length) return rows[0] as T;
      }
    }
  } catch {
    // 还是失败就放弃
  }

  return undefined;
}

function toUnixSeconds(v: unknown): number {
  if (v instanceof Date) return Math.floor(v.getTime() / 1000);
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** 允许用 email 反查 Stripe customer，再读订阅 */
async function fetchStripeSubscription(
  customerId: string | null | undefined,
  email: string
): Promise<{ sub: Stripe.Subscription | null; customerId: string | null }> {
  const stripe = getStripe();
  let cid = customerId ?? null;

  if (!cid && email) {
    const list = await stripe.customers.list({ email, limit: 1 });
    cid = list.data[0]?.id ?? null;
  }
  if (!cid) return { sub: null, customerId: null };

  const subs = await stripe.subscriptions.list({
    customer: cid,
    status: "all",
    limit: 1,
  });

  return { sub: subs.data[0] ?? null, customerId: cid };
}

/* -------------------- Server actions -------------------- */

/** 读“当前订阅状态”供 UI 展示 */
export async function getCurrentSubscription(): Promise<UiSubscription> {
  const session = await getSessionFromCookie();
  if (!session) return { code: "none" };

  const db = getDB();

  const row = await getOne<{
    email: string | null;
    stripeCustomerId: string | null;
    unlimitedUsageUntil: number | Date | null;
  }>(
    db
      .select({
        email: userTable.email,
        stripeCustomerId: userTable.stripeCustomerId,
        unlimitedUsageUntil: userTable.unlimitedUsageUntil,
      })
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
      .limit(1)
  );

  const email = row?.email ?? session.user.email!;
  const { sub } = await fetchStripeSubscription(row?.stripeCustomerId, email);

  // 没有订阅：看是否有“取消后仍可用到某天”
  if (!sub) {
    const untilSec = toUnixSeconds(row?.unlimitedUsageUntil);
    if (untilSec > Math.floor(Date.now() / 1000)) {
      return { code: "canceled", until: new Date(untilSec * 1000) };
    }
    return { code: "none" };
  }

  const priceId = sub.items.data[0]?.price?.id;
  const until = new Date(sub.current_period_end * 1000);

  if (priceId === process.env.NEXT_PUBLIC_STRIPE_SUB_MONTHLY) {
    return sub.cancel_at_period_end ? { code: "canceled", until } : { code: "monthly" };
  }
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_SUB_YEARLY) {
    return sub.cancel_at_period_end ? { code: "canceled", until } : { code: "yearly" };
  }

  return sub.cancel_at_period_end ? { code: "canceled", until } : { code: "none" };
}

/** 生成 Stripe Portal 链接（用于“管理订阅/取消订阅”按钮） */
export async function getBillingPortalUrl(): Promise<string> {
  const session = await getSessionFromCookie();
  if (!session) throw new Error("Unauthorized");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const returnUrl =
    process.env.STRIPE_PORTAL_RETURN_URL ?? `${siteUrl}/dashboard/billing`;

  const db = getDB();
  const row = await getOne<{ stripeCustomerId: string | null; email: string | null }>(
    db
      .select({
        stripeCustomerId: userTable.stripeCustomerId,
        email: userTable.email,
      })
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
      .limit(1)
  );

  const stripe = getStripe();

  // 没有保存过 customerId 就用 email 创建/获取一个
  let customerId = row?.stripeCustomerId ?? null;
  if (!customerId) {
    const found = await stripe.customers.list({ email: row?.email ?? session.user.email!, limit: 1 });
    customerId = found.data[0]?.id ?? null;
    if (!customerId) {
      const c = await stripe.customers.create({
        email: row?.email ?? session.user.email!,
        metadata: { userId: String(session.user.id) },
      });
      customerId = c.id;
    }
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId!,
    return_url: returnUrl,
  });

  return portal.url;
}
