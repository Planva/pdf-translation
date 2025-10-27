// src/app/(dashboard)/dashboard/billing/_components/manage-portal-button.client.tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { getBillingPortalUrl } from "../subscription.server";

export default function ManagePortalButton() {
  const [loading, setLoading] = React.useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={loading}
      aria-busy={loading}
      onClick={async () => {
        try {
          setLoading(true);
          const url = await getBillingPortalUrl();
          if (url) window.location.href = url;
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "Opening…" : "Manage in Stripe"}
    </Button>
  );
}
