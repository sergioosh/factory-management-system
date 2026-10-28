"use client";

import { cn } from "@/lib/cn";

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-2 py-1 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap",
            o.value === value
              ? "bg-accent-soft text-accent"
              : "text-ink-soft hover:bg-black/5 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
