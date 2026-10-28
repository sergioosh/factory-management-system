import Link from "next/link";
import { ArrowLeft2 } from "iconsax-reactjs";
import { cn } from "@/lib/cn";

/** Centered page wrapper for full-page create/edit forms (Back link + stacked cards). */
export function FormShell({
  backHref,
  backLabel = "Back",
  maxWidth = "max-w-3xl",
  children,
}: {
  backHref: string;
  backLabel?: string;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto", maxWidth)}>
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-ink-soft hover:text-ink"
      >
        <ArrowLeft2 size={14} /> {backLabel}
      </Link>
      {children}
    </div>
  );
}

export function FormCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface p-6", className)}>
      <h1 className="text-[15px] font-semibold">{title}</h1>
      {subtitle && <p className="mt-0.5 text-[11.5px] text-ink-faint">{subtitle}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

/** Bottom action row: primary/secondary buttons right-aligned; pass a `left` node (e.g. Archive) to pin it left. */
export function FormActions({
  children,
  left,
  className,
}: {
  children: React.ReactNode;
  left?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-4 flex items-center justify-end gap-2", className)}>
      {left && <div className="mr-auto">{left}</div>}
      {children}
    </div>
  );
}
