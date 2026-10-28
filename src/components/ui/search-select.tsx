"use client";

import { useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ArrowDown2, SearchNormal1 } from "iconsax-reactjs";
import { cn } from "@/lib/cn";

export type Option = { value: number | string; label: string; hint?: string };

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
}: {
  options: Option[];
  value: number | string | null;
  onChange: (value: number | string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!q) return options;
    const needle = q.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(needle) || o.hint?.toLowerCase().includes(needle),
    );
  }, [options, q]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setQ("");
      }}
    >
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-lg border border-line-strong bg-surface px-3.5 text-left text-[13.5px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60",
            !selected && "text-ink-faint",
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ArrowDown2 size={13} className="ml-2 shrink-0 text-ink-faint" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="z-[60] w-[var(--radix-popover-trigger-width)] min-w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
        >
          <div className="relative border-b border-line">
            <SearchNormal1 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="h-8 w-full bg-transparent pl-8 pr-3 text-[12.5px] outline-none placeholder:text-ink-faint"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <div className="px-2.5 py-3 text-center text-[12px] text-ink-faint">No matches</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12.5px] hover:bg-bg cursor-pointer",
                  o.value === value && "bg-accent-soft text-accent",
                )}
              >
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="num ml-3 shrink-0 text-[11px] text-ink-faint">{o.hint}</span>}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
