"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useServerAction } from "zsa-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { useSessionStore } from "@/state/session";
import { useConfigStore } from "@/state/config";
import { Captcha } from "@/components/captcha";

import { forgotPasswordAction } from "./forgot-password.action";
import { forgotPasswordSchema } from "@/schemas/forgot-password.schema";

type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordClientComponent() {
  const { session } = useSessionStore();
  const { isTurnstileEnabled } = useConfigStore();
  const router = useRouter();

  const form = useForm<ForgotPasswordSchema>({
    resolver: zodResolver(forgotPasswordSchema),
    // ✅ 给出默认值，避免初始时 email 为空
    defaultValues: {
      email: session?.user?.email ?? "",
      captchaToken: "",
    },
  });

  // ✅ 如果 session 后到，再把 email 写进表单（保持受控）
  useEffect(() => {
    if (session?.user?.email) {
      form.setValue("email", session.user.email, { shouldValidate: false });
    }
  }, [session?.user?.email]); // eslint-disable-line

  const captchaToken = useWatch({
    control: form.control,
    name: "captchaToken",
  });

  const { execute: sendResetLink, isSuccess } = useServerAction(
    forgotPasswordAction,
    {
      onError: (error) => {
        toast.dismiss();
        toast.error(error.err?.message ?? "Failed to send email");
      },
      onStart: () => {
        toast.loading("Sending reset instructions...");
      },
      onSuccess: () => {
        toast.dismiss();
        toast.success("Reset instructions sent");
      },
    }
  );

  const onSubmit = async (data: ForgotPasswordSchema) => {
    // ✅ 兜底：如果因为某些原因 email 还是空，用 session 的邮箱
    if (!data.email && session?.user?.email) {
      data.email = session.user.email;
    }
    await sendResetLink(data);
  };

  // 提交成功后的提示页
  if (isSuccess) {
    return (
      <div className="container mx-auto px-4 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              If an account exists with that email, we&apos;ve sent you
              instructions to reset your password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push("/sign-in")}
            >
              Back to login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 flex flex-col items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {session ? "Change Password" : "Forgot Password"}
          </CardTitle>
          <CardDescription>
            Enter your email address and we&apos;ll send you instructions to
            reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                // ❌ 移除 disabled（disabled 字段不会进入 RHF values / FormData）
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        className="w-full px-3 py-2"
                        placeholder="name@example.com"
                        autoComplete="email"
                        // ✅ 用 readOnly 替代 disabled，值仍然会被提交
                        readOnly={Boolean(session?.user?.email)}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col justify-center items-center">
                <Captcha
                  onSuccess={(token) => form.setValue("captchaToken", token)}
                  validationError={
                    form.formState.errors.captchaToken?.message
                  }
                />

                <Button
                  type="submit"
                  className="mt-8 mb-2"
                  disabled={Boolean(isTurnstileEnabled && !captchaToken)}
                >
                  Send Reset Instructions
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <div className="mt-4 w-full">
        {session ? (
          <Button
            type="button"
            variant="link"
            className="w-full"
            onClick={() => router.push("/dashboard/settings/change-password")}
          >
            Back to settings
          </Button>
        ) : (
          <Button
            type="button"
            variant="link"
            className="w-full"
            onClick={() => router.push("/sign-in")}
          >
            Back to login
          </Button>
        )}
      </div>
    </div>
  );
}
