"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ArrowDown2, Filter } from "iconsax-reactjs";
import { cn } from "@/lib/cn";
import { Checkbox } from "./checkbox";

export type FilterOption = { value: string; label: string };

/** A compact multi-select dropdown used in table filter bars. */
export function FilterSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = selected.size;

  function toggle(v: string) {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(next);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7.5 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors cursor-pointer",
            count > 0
              ? "border-accent/40 bg-accent-soft text-accent"
              : "border-line-strong bg-surface text-ink-soft hover:border-accent/40",
          )}
        >
          <Filter size={13} variant={count > 0 ? "Bold" : "Linear"} />
          {label}
          {count > 0 && (
            <span className="num flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
              {count}
            </span>
          )}
          <ArrowDown2 size={12} className="opacity-60" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-[60] max-h-72 w-52 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg"
        >
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
            {count > 0 && (
              <button
                onClick={() => onChange(new Set())}
                className="text-[11px] text-accent hover:underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg cursor-pointer"
            >
              <Checkbox checked={selected.has(o.value)} onChange={() => toggle(o.value)} />
              <span className="truncate text-[12.5px]">{o.label}</span>
            </button>
          ))}
          {options.length === 0 && (
            <div className="px-2 py-2 text-[12px] text-ink-faint">No options</div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
