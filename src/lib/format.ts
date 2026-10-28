const nf0 = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });
const nf = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 3 });

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return nf0.format(n);
}

export function fmtQty(n: number | null | undefined, unit?: string | null): string {
  if (n == null) return "—";
  return unit ? `${nf.format(n)} ${unit}` : nf.format(n);
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return (
    dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
    " " +
    dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
