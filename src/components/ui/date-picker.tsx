"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Calendar, ArrowLeft2, ArrowRight2 } from "iconsax-reactjs";
import { cn } from "@/lib/cn";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parse(v: string) {
  const [y, m, d] = v.split("-").map(Number);
  return { y, m: m - 1, d };
}
function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function label(v: string) {
  if (!v) return "";
  const { y, m, d } = parse(v);
  if (!y || Number.isNaN(m) || !d) return v;
  return `${String(d).padStart(2, "0")} ${SHORT[m]} ${y}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  className,
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const base = value ? parse(value) : { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  const [view, setView] = useState({ y: base.y, m: base.m });

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const todayIso = iso(now.getFullYear(), now.getMonth(), now.getDate());

  function shift(delta: number) {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }
  function pick(day: number) {
    onChange(iso(view.y, view.m, day));
    setOpen(false);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          const b = value ? parse(value) : { y: now.getFullYear(), m: now.getMonth() };
          setView({ y: b.y, m: b.m });
        }
      }}
    >
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          className={cn(
            "flex h-10 items-center justify-between gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-left text-[13.5px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60",
            className ?? "w-full",
          )}
        >
          <span className={cn("num truncate", !value && "font-sans text-ink-faint")}>
            {value ? label(value) : placeholder}
          </span>
          <Calendar size={14} className="shrink-0 text-ink-faint" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-[60] w-64 rounded-xl border border-line bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shift(-1)}
              className="rounded-md p-1 text-ink-soft hover:bg-bg hover:text-ink cursor-pointer"
            >
              <ArrowLeft2 size={15} />
            </button>
            <span className="text-[13px] font-medium">
              {MONTHS[view.m]} {view.y}
            </span>
            <button
              type="button"
              onClick={() => shift(1)}
              className="rounded-md p-1 text-ink-soft hover:bg-bg hover:text-ink cursor-pointer"
            >
              <ArrowRight2 size={15} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {WD.map((w) => (
              <div key={w} className="py-1 text-center text-[10.5px] font-medium text-ink-faint">
                {w}
              </div>
            ))}
            {cells.map((day, i) => {
              if (day == null) return <div key={`e${i}`} />;
              const cellIso = iso(view.y, view.m, day);
              const selected = cellIso === value;
              const isToday = cellIso === todayIso;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  className={cn(
                    "num h-8 rounded-md text-[12.5px] hover:bg-bg cursor-pointer",
                    selected && "bg-accent text-white hover:bg-accent",
                    !selected && isToday && "text-accent font-semibold",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(todayIso);
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-[12px] text-accent hover:bg-accent-soft cursor-pointer"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="rounded-md px-2 py-1 text-[12px] text-ink-soft hover:bg-bg cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
