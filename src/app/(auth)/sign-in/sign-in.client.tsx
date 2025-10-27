// src/app/(auth)/sign-in/sign-in.client.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { toast } from "sonner";

import { signInAction } from "./sign-in.actions";
import { type SignInSchema, signInSchema } from "@/schemas/signin.schema";

import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import SeparatorWithText from "@/components/separator-with-text";

import SSOButtons from "../_components/sso-buttons";


type Props = { redirectPath: string };

export default function SignInClient({ redirectPath }: Props) {
  const router = useRouter();
  const form = useForm<SignInSchema>({ resolver: zodResolver(signInSchema) });
  const [pending, setPending] = React.useState(false);

  const onSubmit = async (values: SignInSchema) => {
    setPending(true);
    try {
      const res = await signInAction(values);

      // —— 统一“成功/失败”判定 —— //
      // 只在“明确失败信号”时才算失败：
      //   { ok: false } 或 { success: false } 或 显式提供 error/message
      const explicitFail =
        res &&
        typeof res === "object" &&
        (
          (Object.prototype.hasOwnProperty.call(res, "ok") && (res as any).ok === false) ||
          (Object.prototype.hasOwnProperty.call(res, "success") && (res as any).success === false) ||
          (res as any).error ||
          (res as any).message === "Invalid credentials"
        );

      if (!explicitFail) {
        // 其它情况一律按“成功”处理（包括返回 void / null / {ok:true} / {success:true} / 直接在 server action 里已设置 cookie）
        router.replace(redirectPath);
        router.refresh();
        // 成功提示（可留可去）
        // toast.success("Signed in");
        return;
      }

      toast.error((res as any)?.message || (res as any)?.error || "Sign in failed");
    } catch (error: any) {
      // server action 里如果调用了 redirect，会抛出 NEXT_REDIRECT，不能当失败
      if (error?.digest && String(error.digest).startsWith("NEXT_REDIRECT")) {
        return;
      }
      toast.error("Sign in failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-[90vh] flex flex-col items-center px-4 justify-center bg-background my-6 md:my-10">
      <div className="w-full max-w-md space-y-8 p-6 md:p-10 bg-card rounded-xl shadow-sm border">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <div className="mt-6">
            {/* 登录页用 isSignIn，文案会是 “Sign in with Google” */}
            <SSOButtons isSignIn />
          </div>
        </div>

        <SeparatorWithText text="Email" />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="username"
                      placeholder="you@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      placeholder="Password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
              {pending ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </Form>

        {/* 辅助链接区 */}
        <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">
          <p>
            <Link href="/forgot-password" className="font-medium text-primary hover:underline">
              Forgot your password?
            </Link>
          </p>
          <p>
            Don&apos;t have an account?{" "}
            <Link href="/sign-up" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
