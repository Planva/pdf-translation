// src/app/(auth)/sign-in/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import SignInClient from "./sign-in.client";

// ✅ Next 15：searchParams 是 Promise，需要 async/await
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const sp = await searchParams;
  const raw = sp?.redirect;
  const redirectPath =
    typeof raw === "string" && raw.startsWith("/") ? raw : "/dashboard";
  return <SignInClient redirectPath={redirectPath} />;
}
