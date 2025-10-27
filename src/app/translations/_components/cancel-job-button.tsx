"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface CancelJobButtonProps {
  jobId: string;
  disabled?: boolean;
}

export function CancelJobButton({ jobId, disabled }: CancelJobButtonProps) {
  const router = useRouter();
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancel = async () => {
    if (isCancelling || disabled) {
      return;
    }

    setIsCancelling(true);
    try {
      const response = await fetch(`/api/translation-jobs/${jobId}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const errorMessage = data?.error ?? "Unable to cancel job";
        toast.error(errorMessage);
        return;
      }

      toast.success("Job cancelled");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Unexpected error while cancelling job");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Button
      variant="destructive"
      onClick={handleCancel}
      disabled={disabled || isCancelling}
    >
      {isCancelling ? "Cancelling…" : "Cancel job"}
    </Button>
  );
}
