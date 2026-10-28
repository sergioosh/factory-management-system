"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentDownload } from "iconsax-reactjs";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/cn";
import { exportData } from "@/lib/export";
import { OP_TABS, type TabKey } from "./tabs";

function href(tab: TabKey, from: string, to: string) {
  return `/reports/operational?tab=${tab}&from=${from}&to=${to}`;
}

export function OpTabs({ active, from, to }: { active: TabKey; from: string; to: string }) {
  const router = useRouter();
  return (
    <div className="-mb-px flex gap-1 overflow-x-auto border-b border-line">
      {OP_TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => router.push(href(t.key, from, to))}
          className={cn(
            "shrink-0 cursor-pointer border-b-2 px-3 py-2.5 text-[13px] transition-colors",
            t.key === active
              ? "border-accent font-medium text-ink"
              : "border-transparent text-ink-soft hover:text-ink",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function OpRange({ tab, from, to }: { tab: TabKey; from: string; to: string }) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
      <label className="flex flex-col gap-1 text-[11.5px] text-ink-soft">
        From
        <DatePicker value={f} onChange={setF} className="w-40" />
      </label>
      <label className="flex flex-col gap-1 text-[11.5px] text-ink-soft">
        To
        <DatePicker value={t} onChange={setT} className="w-40" />
      </label>
      <Button onClick={() => router.push(`/reports/operational?tab=${tab}&from=${f}&to=${t}`)}>
        Apply
      </Button>
    </div>
  );
}

export function OpExport({
  filename,
  title,
  columns,
  rows,
}: {
  filename: string;
  title: string;
  columns: { header: string; numeric?: boolean }[];
  rows: (string | number | null | undefined)[][];
}) {
  return (
    <button
      onClick={() =>
        exportData("csv", { filename, title, subtitle: `${rows.length} rows`, columns, rows })
      }
      className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] text-ink-soft hover:bg-bg hover:text-ink cursor-pointer"
    >
      <DocumentDownload size={14} /> Export CSV
    </button>
  );
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="num mt-1 text-[20px] font-semibold leading-tight">{value}</div>
    </div>
  );
}
