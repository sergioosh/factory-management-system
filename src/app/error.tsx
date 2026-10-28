"use client";

import { useEffect } from "react";
import { Warning2 } from "iconsax-reactjs";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <Warning2 size={22} variant="Bold" />
      </div>
      <div>
        <h1 className="text-[15px] font-semibold text-ink">This page couldn&apos;t load</h1>
        <p className="mt-1 max-w-sm text-[13px] text-ink-faint">
          Something went wrong. Try again, or reload the page.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Button onClick={() => reset()}>Try again</Button>
      </div>
    </div>
  );
}
