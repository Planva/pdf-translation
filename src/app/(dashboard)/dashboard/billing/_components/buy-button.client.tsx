// src/app/(dashboard)/dashboard/billing/_components/buy-button.client.tsx
"use client";

import * as React from "react";
import { createCheckoutSessionUrl } from "@/app/(marketing)/price/server-actions";
import { Button } from "@/components/ui/button";

export default function BuyButton({
  kind,
  priceId,
  label,
  className,
}: {
  kind: "pack" | "subscription";
  priceId: string;
  label: string;
  className?: string;
}) {
  const [loading, setLoading] = React.useState(false);

  return (
    <Button
      type="button"
      className={className}
      disabled={loading}
      aria-busy={loading}
      onClick={async () => {
        try {
          setLoading(true);
          const url = await createCheckoutSessionUrl({ kind, priceId });
          if (url) window.location.href = url;
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "Redirecting…" : label}
    </Button>
  );
}
