"use client";

import { useRouter } from "next/navigation";
import { Printer, ArrowLeft2 } from "iconsax-reactjs";
import { Button } from "@/components/ui/button";

export function PrintActions() {
  const router = useRouter();
  return (
    <div className="no-print mb-4 flex justify-between font-sans">
      <Button variant="secondary" size="sm" onClick={() => router.back()}>
        <ArrowLeft2 size={14} /> Back
      </Button>
      <Button size="sm" onClick={() => window.print()}>
        <Printer size={14} /> Print
      </Button>
    </div>
  );
}
