// src/config/price-to-credits.ts
export const PRICE_TO_CREDITS: Record<string, number> = {
    [process.env.NEXT_PUBLIC_STRIPE_PACK_STARTER!]: 300,
    [process.env.NEXT_PUBLIC_STRIPE_PACK_STANDARD!]: 1000,
    [process.env.NEXT_PUBLIC_STRIPE_PACK_BULK!]: 1200,
    [process.env.NEXT_PUBLIC_STRIPE_SUB_MONTHLY!]: 1200,   // 每月
    [process.env.NEXT_PUBLIC_STRIPE_SUB_YEARLY!]: 16000,   // 每年
  };
  