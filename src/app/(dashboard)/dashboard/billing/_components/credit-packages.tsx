// Server Component（不要 "use client"）
import { getStripe } from "@/lib/stripe";
import { getSessionFromCookie } from "@/utils/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FREE_MONTHLY_CREDITS } from "@/constants";
import BuyButton from "./buy-button.client";
const ENABLE_PACKS = process.env.FEATURE_ENABLE_PACKS !== "false";
const ENABLE_SUBS  = process.env.FEATURE_ENABLE_SUBSCRIPTIONS !== "false";
type Product = {
  priceId: string;
  kind: "pack" | "subscription";
  title: string;
  subtitle?: string;
  unitAmountText: string;
  badge?: string;
};

function fmtMoney(unitAmount: number | null, currency: string | null) {
  const cents = typeof unitAmount === "number" ? unitAmount : 0;
  const iso = (currency || "usd").toUpperCase();
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: iso,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function readEnvPriceIds() {
  const ids = {
    PACK_STARTER: process.env.NEXT_PUBLIC_STRIPE_PACK_STARTER,
    PACK_STANDARD: process.env.NEXT_PUBLIC_STRIPE_PACK_STANDARD,
    PACK_BULK: process.env.NEXT_PUBLIC_STRIPE_PACK_BULK,
    SUB_MONTHLY: process.env.NEXT_PUBLIC_STRIPE_SUB_MONTHLY,
    SUB_YEARLY: process.env.NEXT_PUBLIC_STRIPE_SUB_YEARLY,
  };
  return Object.fromEntries(
    Object.entries(ids).filter(([, v]) => typeof v === "string" && v)
  ) as Record<string, string>;
}

async function loadProducts(): Promise<Product[]> {
  const env = readEnvPriceIds();
  const pairs = Object.entries(env).map(([key, id]) => ({ key, id }));
  if (!pairs.length) return [];

  const stripe = getStripe();

  const prices = await Promise.all(
    pairs.map(async ({ key, id }) => {
      const p = await stripe.prices.retrieve(id);

      const kind: Product["kind"] =
        p.recurring?.interval ? "subscription" : "pack";

      const nickname = p.nickname?.trim();
      const fallbackTitle =
        key === "PACK_STARTER"
          ? "Starter"
          : key === "PACK_STANDARD"
          ? "Standard"
          : key === "PACK_BULK"
          ? "Bulk"
          : key === "SUB_MONTHLY"
          ? "Monthly"
          : key === "SUB_YEARLY"
          ? "Yearly"
          : "Plan";

      const subtitle =
        kind === "subscription"
          ? p.recurring?.interval === "year"
            ? "Credits per year · rollover"
            : "Credits per month · rollover"
          : undefined;

      const unitAmountText =
        kind === "subscription" && p.recurring?.interval === "month"
          ? `${fmtMoney(p.unit_amount, p.currency)} / mo`
          : kind === "subscription" && p.recurring?.interval === "year"
          ? `${fmtMoney(p.unit_amount, p.currency)} / yr`
          : `${fmtMoney(p.unit_amount, p.currency)}`;

      return {
        priceId: id,
        kind,
        title: nickname || fallbackTitle,
        subtitle,
        unitAmountText,
        badge:
          key === "PACK_STANDARD" || key === "SUB_YEARLY" ? "Popular" : undefined,
      } as Product;
    })
  );

  // 一次性在前、订阅在后
  let list: Product[] = [
    ...prices.filter((x) => x.kind === "pack"),
    ...prices.filter((x) => x.kind === "subscription"),
  ];

  // ✅ 按开关过滤
  if (!ENABLE_PACKS) list = list.filter((x) => x.kind !== "pack");
  if (!ENABLE_SUBS)  list = list.filter((x) => x.kind !== "subscription");

  return list;
}

function ProductCard({ p }: { p: Product }) {
  return (
    <div
      className={[
        "relative w-[280px] shrink-0 rounded-2xl border border-border bg-card text-card-foreground p-5",
        "shadow-sm transition-shadow hover:shadow-md",
        p.badge ? "ring-1 ring-fuchsia-500/20 dark:ring-fuchsia-500/40" : "",
      ].join(" ")}
    >
      {p.badge && (
        <span className="absolute right-3 top-3 rounded-full bg-fuchsia-600/15 px-2 py-0.5 text-xs text-fuchsia-600 dark:text-fuchsia-300">
          {p.badge}
        </span>
      )}

      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {p.kind === "subscription" ? "Subscription" : "One-time"}
      </div>
      <div className="mt-1 text-lg font-semibold">{p.title}</div>
      <div className="mt-2 text-3xl font-bold">{p.unitAmountText}</div>
      {p.subtitle && (
        <div className="mt-1 text-xs text-muted-foreground">{p.subtitle}</div>
      )}

      <div className="mt-5">
        <BuyButton
          kind={p.kind}
          priceId={p.priceId}
          label={p.kind === "subscription" ? "Subscribe" : "Purchase Now"}
          className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
        />
      </div>
    </div>
  );
}

/** 余额卡片（恢复“位置①”显示） */
async function CreditSummaryCard() {
  const session = await getSessionFromCookie();
  if (!session?.user) return null;

  const credits = Number(session.user.currentCredits || 0);

  // 文案：如果开启了每日赠送，就显示每日；否则显示每月常量
  const dailyEnabled = process.env.FEATURE_DAILY_FREE_CREDITS_ENABLED !== "false";
  const dailyAmount = Number(process.env.DAILY_FREE_CREDITS ?? "0") || 0;
  const tip =
    dailyEnabled && dailyAmount > 0
      ? `You get ${dailyAmount} free credits every day.`
      : `You get ${FREE_MONTHLY_CREDITS} free credits every month.`;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Credits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl font-bold">
          {credits.toLocaleString()} credits
        </div>
        <div className="text-sm text-muted-foreground">{tip}</div>
      </CardContent>
    </Card>
  );
}

export async function CreditPackages() {
  const products = await loadProducts();

  return (
    <>
      {/* 顶部“Credits …”卡片 */}
      <CreditSummaryCard />

      {/* 横向滑动的价格卡片（自动读取 Stripe Price） */}
      {!!products.length && (
        <div className="rounded-2xl border border-border bg-muted p-4 md:p-5">
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-4 pr-4">
              {products.map((p) => (
                <ProductCard key={p.priceId} p={p} />
              ))}
            </div>
          </div>
          <div className="mt-2 text-center text-xs text-muted-foreground">
            Scroll to see more plans →
          </div>
        </div>
      )}
    </>
  );
}
