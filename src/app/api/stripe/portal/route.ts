// src/app/api/stripe/portal/route.ts
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSessionFromCookie } from "@/utils/auth";
import { getDB } from "@/db";
import { userTable } from "@/db/schema";
import { eq } from "drizzle-orm";

function getSiteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "http://localhost:3000";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

async function getOrCreateCustomerId(opts: { userId: string; email: string }) {
  const db = getDB();
  const stripe = getStripe();

  // 先从 DB 取
  const row = await db
    .select({ id: userTable.id, stripeCustomerId: userTable.stripeCustomerId })
    .from(userTable)
    .where(eq(userTable.id, opts.userId))
    .get();

  if ((row as any)?.stripeCustomerId) {
    return (row as any).stripeCustomerId as string;
  }

  // 用 email 在 Stripe 里查（若该用户之前通过 checkout 创建过 customer）
  const list = await stripe.customers.list({ email: opts.email, limit: 1 });
  let customerId = list.data[0]?.id;

  // 如果还没有，就创建一个
  if (!customerId) {
    const c = await stripe.customers.create({
      email: opts.email,
      metadata: { userId: opts.userId },
    });
    customerId = c.id;
  }

  // 回写 DB
  await db
    .update(userTable)
    .set({ stripeCustomerId: customerId, updatedAt: new Date() })
    .where(eq(userTable.id, opts.userId));

  return customerId;
}

// ✅ 使用默认（Node/Server）运行时，兼容 OpenNext/Cloudflare
export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.redirect(new URL("/sign-in?next=/dashboard/billing", getSiteUrl()));
  }

  const stripe = getStripe();
  const customerId = await getOrCreateCustomerId({
    userId: String(session.user.id),
    email: session.user.email,
  });

  const returnUrl =
    process.env.STRIPE_PORTAL_RETURN_URL ||
    `${getSiteUrl()}/dashboard/billing`;

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return NextResponse.redirect(portal.url, { status: 302 });
}

// 兼容表单 POST
export async function POST() {
  return GET();
}
