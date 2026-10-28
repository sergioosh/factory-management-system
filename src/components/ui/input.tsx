"use client";

import { Children, isValidElement, useEffect, useRef, useState } from "react";
import * as RSelect from "@radix-ui/react-select";
import { Eye, EyeSlash, ArrowDown2, TickSquare } from "iconsax-reactjs";
import { cn } from "@/lib/cn";

const base =
  "control-w rounded-lg border border-line-strong bg-surface px-3.5 text-[13.5px] text-ink placeholder:text-ink-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-shadow disabled:opacity-60 disabled:bg-bg";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  // Number inputs default to step="1", which blocks decimal entry (and hides
  // the decimal key on iOS/Android numeric keypads) unless overridden. Almost
  // everything we count here — kg, litres, UGX, percentages — is fractional,
  // so default to "any" and let callers opt back into whole numbers.
  const step = props.type === "number" ? (props.step ?? "any") : props.step;
  return <input className={cn(base, "h-10", className)} {...props} step={step} />;
}

/**
 * Numeric input for React state shaped as `number`.
 *
 * The naive pattern — `<Input type="number" value={n || ""} onChange={(e) =>
 * setN(Number(e.target.value))} />` — is broken in two ways: (1) `n || ""`
 * blanks the field whenever the value is exactly 0, so you can't type a
 * leading 0 at all; (2) feeding `Number(e.target.value)` straight back into
 * `value` round-trips through the parsed number every keystroke, so typing
 * "5." becomes "5" (the dot is dropped) and "5.0" becomes "5" (the trailing
 * zero is dropped) — decimals can never be completed.
 *
 * This keeps its own display string so what you typed stays on screen,
 * parses it to a number for the caller on every keystroke it can, and only
 * resyncs from the `value` prop when that value changed for a reason other
 * than this input's own onChange (e.g. a sibling field prefilling it).
 */
export function NumberInput({
  value,
  onChange,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  onChange: (n: number) => void;
}) {
  const [raw, setRaw] = useState(value || value === 0 ? String(value) : "");
  const lastEmitted = useRef(value ?? 0);

  useEffect(() => {
    const v = value ?? 0;
    if (v !== lastEmitted.current) {
      lastEmitted.current = v;
      setRaw(value || value === 0 ? String(value) : "");
    }
  }, [value]);

  return (
    <Input
      type="number"
      className={className}
      value={raw}
      onChange={(e) => {
        const s = e.target.value;
        setRaw(s);
        const n = s.trim() === "" ? 0 : Number(s);
        if (!Number.isNaN(n)) {
          lastEmitted.current = n;
          onChange(n);
        }
      }}
      {...props}
    />
  );
}

export function PasswordInput({
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        className={cn(base, "h-10 pr-9", className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink cursor-pointer"
      >
        {show ? <EyeSlash size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, "py-2.5 min-h-16 resize-y", className)} {...props} />;
}

type Opt = { value: string; label: string; disabled?: boolean };

/**
 * Custom modern dropdown — a drop-in for the old native <Select>: still takes
 * <option> children, `value`, and an event-shaped `onChange`. An <option> with
 * an empty value becomes the placeholder.
 */
export function Select({
  className,
  children,
  value,
  onChange,
  disabled,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & {
  value?: string | number;
  onChange?: (e: { target: { value: string } }) => void;
}) {
  const options: Opt[] = [];
  let placeholder = "Select…";
  Children.forEach(children, (child) => {
    if (!isValidElement(child) || child.type !== "option") return;
    const p = child.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean };
    const label = typeof p.children === "string" ? p.children : String(p.children ?? "");
    const val = p.value !== undefined ? String(p.value) : label;
    if (val === "") {
      placeholder = label || placeholder;
      return;
    }
    options.push({ value: val, label, disabled: p.disabled });
  });

  const current = value == null || value === "" ? undefined : String(value);

  return (
    <RSelect.Root
      value={current}
      disabled={disabled}
      onValueChange={(v) => onChange?.({ target: { value: v } })}
    >
      <RSelect.Trigger
        className={cn(
          base,
          "flex h-10 items-center justify-between gap-2 pr-2.5 data-[placeholder]:text-ink-faint",
          className,
        )}
        {...(props as Record<string, unknown>)}
      >
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon>
          <ArrowDown2 size={13} className="text-ink-faint" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={4}
          className="z-[70] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
        >
          <RSelect.Viewport className="p-1">
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-[12.5px] outline-none data-[highlighted]:bg-bg data-[state=checked]:bg-accent-soft data-[state=checked]:text-accent data-[disabled]:opacity-40"
              >
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator>
                  <TickSquare size={13} variant="Bold" />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

export function Field({
  label,
  required,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  /** short helper text shown below the control, e.g. "Optional." */
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11.5px] text-ink-faint">{hint}</span>}
      {error && <span className="mt-1 block text-[12px] text-danger">{error}</span>}
    </label>
  );
}
