"use client";

import { useEffect } from "react";
import { Warning2 } from "iconsax-reactjs";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface it in the browser console / server logs for now. If this app ever
    // wires up an error-tracking service, this is the one place to report from.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <Warning2 size={22} variant="Bold" />
      </div>
      <div>
        <h1 className="text-[15px] font-semibold text-ink">This page couldn&apos;t load</h1>
        <p className="mt-1 max-w-sm text-[13px] text-ink-faint">
          Something went wrong while loading this page. You can try again, or head back
          to the dashboard.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => (window.location.href = "/")}>
          Go back
        </Button>
        <Button onClick={() => reset()}>Try again</Button>
      </div>
    </div>
  );
}
