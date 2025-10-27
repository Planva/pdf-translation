// src/app/api/test-deduct/route.ts
import { NextResponse } from "next/server";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import { getSessionFromCookie } from "@/utils/auth";
import { updateUserCredits, hasUnlimitedAccess } from "@/utils/credits";

// ⬇️ 使用 Drizzle ORM，而不是 db.execute
import { getDB } from "@/db";
import { guestQuotaTable } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

/** =============== 小工具 =============== **/
function dayKeyUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function sha256Hex(s: string) {
  // @ts-ignore
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(s);
    const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(s).digest("hex");
}

async function signPayload(payload: string, secret: string) {
  return sha256Hex(payload + "|" + secret);
}

async function makeDeviceId(h: Headers, secret: string) {
  const ua = h.get("user-agent") || "";
  const al = h.get("accept-language") || "";
  return (await sha256Hex(`did|${ua}|${al}|${secret}`)).slice(0, 32);
}

function b64urlEncode(s: string) {
  // @ts-ignore
  if (typeof Buffer !== "undefined") return Buffer.from(s, "utf8").toString("base64url");
  // @ts-ignore
  const b64 = btoa(s);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlDecode(s: string) {
  // @ts-ignore
  if (typeof Buffer !== "undefined") return Buffer.from(s, "base64url").toString("utf8");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  // @ts-ignore
  return atob(b64);
}

function getClientIp(h: Headers): string {
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}

/** =============== 业务主逻辑 =============== **/
export async function POST(req: Request) {
  // Next 现在要求动态 API 等取值要先 await 再用
  const h = await nextHeaders();
  const c = await nextCookies();

  const session = await getSessionFromCookie();
  const USAGE_MODE = (process.env.FEATURE_USAGE_MODE ?? "credits") as "credits" | "free";
  const cost = Number(process.env.PER_USE_CREDIT_COST ?? "1") || 1;

  /** 0) 全站“免费模式”（按你的开关） */
  if (USAGE_MODE === "free") {
    return NextResponse.redirect(new URL("/?test=ok&mode=free", req.url), { status: 302 });
  }

  /** 1) 已登录用户：先看是否“订阅无限使用”，是的话直接放行；否则走扣分 */
  if (session?.user?.id) {
    const userId = String(session.user.id);

    // ① 先判断是否处于“无限使用期”
    if (await hasUnlimitedAccess(userId)) {
      return NextResponse.redirect(new URL("/?test=ok&mode=unlimited", req.url), { status: 302 });
    }

    // ② 否则尝试扣费（updateUserCredits 内部也会再次做无限期/余额不足的保护）
    const r = await updateUserCredits(userId, -cost);

    if ((r as any)?.ok || (r as any)?.skipped === "unlimited") {
      return NextResponse.redirect(new URL("/?test=ok", req.url), { status: 302 });
    }
    if ((r as any)?.error === "INSUFFICIENT_CREDITS") {
      return NextResponse.redirect(new URL("/?test=insufficient", req.url), { status: 302 });
    }

    // 兜底：未知情况，也记为 insufficient，便于用户侧提示
    return NextResponse.redirect(new URL("/?test=insufficient", req.url), { status: 302 });
  }

  /** 2) 未登录用户（游客）：将“每日免费额度 + 限流”持久化到 D1（Cookie 仅做快照） */
  if (process.env.FEATURE_GUEST_DAILY_FREE_ENABLED === "false") {
    // 未开游客时引导登录（保持你之前的行为）
    return NextResponse.redirect(new URL("/sign-in?next=/", req.url), { status: 302 });
  }

  const day = dayKeyUTC();
  const secret = process.env.GUEST_COOKIE_SECRET || "dev-secret";
  const freePerDay =
    Number(process.env.GUEST_DAILY_FREE_CREDITS ?? process.env.DAILY_FREE_CREDITS ?? "0") || 0;
  const devLimit = Number(process.env.GUEST_DEVICE_DAILY_LIMIT ?? "100") || 100;
  const ipChangesLimit = Number(process.env.GUEST_IP_CHANGES_PER_DAY_LIMIT ?? "5") || 5;
  const ipDailyCap = Number(process.env.GUEST_IP_DAILY_CAP ?? "20") || 20; // 同一 IP 的日总上限

  // 设备指纹（弱但稳定于同一浏览器）
  let did = c.get("did")?.value;
  if (!did) {
    did = await makeDeviceId(h, secret);
    c.set("did", did, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // 游客 ID（沿用）
  let gid = c.get("gid")?.value;
  if (!gid) {
    gid = crypto.randomUUID();
    c.set("gid", gid, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // IP（CF / 反代 / 本地）
  const ip = getClientIp(h);

  type GuestQuota = {
    day: string;
    did: string;
    ip: string;
    remaining: number;
    used: number;
    ipChanges: number;
  };

  // —— 核心：使用 Drizzle 访问 D1 ——
  const db = getDB();

  // 2.1 读取 (day, did)
  const row = await db
    .select({
      day: guestQuotaTable.day,
      did: guestQuotaTable.did,
      ip: guestQuotaTable.ip,
      remaining: guestQuotaTable.remaining,
      used: guestQuotaTable.used,
      ipChanges: guestQuotaTable.ipChanges,
    })
    .from(guestQuotaTable)
    .where(and(eq(guestQuotaTable.day, day), eq(guestQuotaTable.did, did)))
    .get();

  let data: GuestQuota;
  if (!row) {
    data = { day, did, ip, remaining: freePerDay, used: 0, ipChanges: 0 };
    // D1 有的版本没有 onConflictDoNothing，这里就 try/catch 一次
    try {
      await db.insert(guestQuotaTable).values({
        day: data.day,
        did: data.did,
        ip: data.ip,
        remaining: data.remaining,
        used: data.used,
        ipChanges: data.ipChanges,
        updatedAt: Math.floor(Date.now() / 1000),
      });
    } catch {
      // ignore
    }
  } else {
    data = {
      day: row.day as string,
      did: row.did as string,
      ip: (row.ip as string) ?? ip,
      remaining: Number(row.remaining ?? 0),
      used: Number(row.used ?? 0),
      ipChanges: Number(row.ipChanges ?? 0),
    };
  }

  // 2.2 更换 IP 次数限制
  if (data.ip !== ip) {
    data.ip = ip;
    data.ipChanges += 1;

    await db
      .update(guestQuotaTable)
      .set({
        ip: data.ip,
        ipChanges: data.ipChanges,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(and(eq(guestQuotaTable.day, day), eq(guestQuotaTable.did, did)));

    if (data.ipChanges > ipChangesLimit) {
      // 写一个 cookie 快照（非权威）
      const payload = JSON.stringify(data);
      const sig = await signPayload(payload, secret);
      const cookieName = `gq_${day}`;
      c.set(cookieName, `${b64urlEncode(payload)}.${b64urlEncode(sig)}`, {
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
      return NextResponse.redirect(new URL("/?test=rate_limited", req.url), { status: 302 });
    }
  }

  // 2.3 同一 IP 的日总上限（用 sql() 聚合）
  const ipAgg = await db
    .select({
      usedSum: sql<number>`COALESCE(sum(${guestQuotaTable.used}), 0)`,
    })
    .from(guestQuotaTable)
    .where(and(eq(guestQuotaTable.day, day), eq(guestQuotaTable.ip, ip)))
    .get();

  if (Number(ipAgg?.usedSum ?? 0) >= ipDailyCap) {
    return NextResponse.redirect(new URL("/?test=rate_limited_ip", req.url), { status: 302 });
  }

  // 2.4 单设备日次限额
  if (data.used >= devLimit) {
    const payload = JSON.stringify(data);
    const sig = await signPayload(payload, secret);
    const cookieName = `gq_${day}`;
    c.set(cookieName, `${b64urlEncode(payload)}.${b64urlEncode(sig)}`, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
    return NextResponse.redirect(new URL("/?test=rate_limited", req.url), { status: 302 });
  }

  // 2.5 配额不足
  if (data.remaining < cost) {
    const payload = JSON.stringify(data);
    const sig = await signPayload(payload, secret);
    const cookieName = `gq_${day}`;
    c.set(cookieName, `${b64urlEncode(payload)}.${b64urlEncode(sig)}`, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
    return NextResponse.redirect(new URL("/?test=guest_no_quota", req.url), { status: 302 });
  }

  // 2.6 扣除 + 写回 D1
  data.remaining -= cost;
  data.used += 1;

  await db
    .update(guestQuotaTable)
    .set({
      remaining: data.remaining,
      used: data.used,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(and(eq(guestQuotaTable.day, day), eq(guestQuotaTable.did, did)));

  // 同步一份 cookie “快照”（非权威）
  {
    const payload = JSON.stringify(data);
    const sig = await signPayload(payload, secret);
    const cookieName = `gq_${day}`;
    c.set(cookieName, `${b64urlEncode(payload)}.${b64urlEncode(sig)}`, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }

  return NextResponse.redirect(
    new URL(`/?test=guest_ok&remain=${data.remaining}`, req.url),
    { status: 302 },
  );
}
