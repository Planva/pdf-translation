// src/app/(dashboard)/dashboard/billing/subscription.shared.ts
import type { UiSubscription } from "./subscription.server";

/** 小工具：格式化日期（本地时区） */
export function formatUntil(d?: Date) {
  if (!d) return "-";
  try {
    return d.toLocaleString();
  } catch {
    return String(d);
  }
}

/** 把订阅状态转成一行文案 —— 带空值兜底 */
export function renderStatusLine(s?: UiSubscription) {
  if (!s) return "Current subscription: None";
  if (s.code === "none") return "Current subscription: None";
  if (s.code === "monthly") return "Current subscription: Monthly";
  if (s.code === "yearly") return "Current subscription: Yearly";
  // canceled
  return `Current subscription: Canceled (valid until ${formatUntil(s.until)})`;
}


/** 返回一个简短 Badge 文案（可选） */
export function renderBadgeText(s?: UiSubscription) {
  if (!s || s.code === "none") return "Not Subscribed";
  if (s.code === "monthly") return "Monthly";
  if (s.code === "yearly") return "Yearly";
  return "Canceled";
}
