// src/app/(marketing)/price/server-actions.ts
'use server';

import { redirect } from 'next/navigation';
import { getStripe } from '@/lib/stripe';
import { getSessionFromCookie } from '@/utils/auth';
import { getSiteUrl } from "@/utils/site-url";

const ENABLE_PACKS = process.env.FEATURE_ENABLE_PACKS !== 'false';
const ENABLE_SUBS  = process.env.FEATURE_ENABLE_SUBSCRIPTIONS !== 'false';

export async function checkout(
  { kind, priceId }: { kind: 'pack' | 'subscription'; priceId: string }
) {
  // 关掉的模式直接拒绝
  if ((kind === 'pack' && !ENABLE_PACKS) || (kind === 'subscription' && !ENABLE_SUBS)) {
    throw new Error('This payment mode is disabled');
  }

  const session = await getSessionFromCookie();
  if (!session?.user) redirect('/sign-in?next=/price');

  const stripe = getStripe();
  // ✅ 统一通过工具函数拿到带协议的站点 URL，避免构建期 Invalid URL
  const siteUrl = getSiteUrl();

  const s = await stripe.checkout.sessions.create({
    mode: kind === 'subscription' ? 'subscription' : 'payment',
    customer_email: session.user.email!,
    line_items: [{ price: priceId, quantity: 1 }],
    // ✅ 支付成功/取消均回 Billing
    success_url: `${siteUrl}/dashboard/billing?status=success&kind=${kind}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${siteUrl}/dashboard/billing?status=cancel&kind=${kind}`,
    allow_promotion_codes: true,
    metadata: { userId: String(session.user.id), kind, priceId },
  });

  redirect(s.url!);
}
export async function createCheckoutSessionUrl(
  { kind, priceId }: { kind: "pack" | "subscription"; priceId: string }
): Promise<string> {
  const ENABLE_PACKS = process.env.FEATURE_ENABLE_PACKS !== "false";
  const ENABLE_SUBSCRIPTIONS = process.env.FEATURE_ENABLE_SUBSCRIPTIONS !== "false";
  if ((kind === "pack" && !ENABLE_PACKS) || (kind === "subscription" && !ENABLE_SUBSCRIPTIONS)) {
    throw new Error("This product is currently disabled.");
  }

  const session = await getSessionFromCookie(); // 你文件里已有
  const siteUrl = getSiteUrl();                 // 你文件里已有

  if (!session?.user?.email) {
    return `${siteUrl}/sign-in?redirect=/dashboard/billing`;
  }

  const stripe = await getStripe();
  const s = await stripe.checkout.sessions.create({
    mode: kind === "subscription" ? "subscription" : "payment",
    customer_email: session.user.email!,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/dashboard/billing?status=success&kind=${kind}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/dashboard/billing?status=cancel&kind=${kind}`,
    allow_promotion_codes: true,
    metadata: { userId: String(session.user.id), kind, priceId },
  });

  return s.url!;
}

