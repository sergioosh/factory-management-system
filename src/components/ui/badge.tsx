import { cn } from "@/lib/cn";

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "accent";

const tones: Record<Tone, string> = {
  neutral: "bg-black/5 text-ink-soft",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium leading-4",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  draft: "neutral",
  pending: "warn",
  submitted: "warn",
  confirmed: "info",
  in_production: "info",
  in_progress: "info",
  planned: "neutral",
  ordered: "info",
  partial: "warn",
  ready: "accent",
  approved: "ok",
  received: "ok",
  completed: "ok",
  invoiced: "ok",
  paid: "ok",
  closed: "neutral",
  unpaid: "danger",
  rejected: "danger",
  cancelled: "danger",
  low: "danger",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"}>{status.replaceAll("_", " ")}</Badge>;
}
