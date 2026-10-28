"use client";

import { cn } from "@/lib/cn";

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  className,
  label,
  stop,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  label?: React.ReactNode;
  /** stop click propagation (for use inside clickable rows) */
  stop?: boolean;
}) {
  const on = checked || indeterminate;
  const box = (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        on ? "border-accent bg-accent text-white" : "border-line-strong bg-surface hover:border-accent",
        disabled && "opacity-50",
      )}
    >
      {indeterminate ? (
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
          <path d="M2 5h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : checked ? (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.5l2.2 2.2L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );

  return (
    <label
      className={cn("inline-flex cursor-pointer items-center gap-2 select-none", disabled && "cursor-default", className)}
      onClick={stop ? (e) => e.stopPropagation() : undefined}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {box}
      {label != null && <span className="text-[12.5px]">{label}</span>}
    </label>
  );
}
